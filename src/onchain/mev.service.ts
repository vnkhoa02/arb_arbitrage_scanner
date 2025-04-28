import { TransactionRequest } from '@ethersproject/abstract-provider';
import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { ethers } from 'ethers';
import { defaultProvider, mevProvider } from 'src/dex/config/provider';
import { BEAVER_BUILD_RPC, flashBotSigner, signer, TITAN_RPC } from './config';
import { ISimpleArbitrageParams } from './types';
import { sendNotify } from './utils/notify';

@Injectable()
export class MevService {
  private readonly logger = new Logger(MevService.name);
  private latestBlock = 0;
  private params: ISimpleArbitrageParams;

  async submitArbitrage(
    txRequest: TransactionRequest,
    params: ISimpleArbitrageParams,
  ): Promise<string> {
    try {
      this.params = params;
      this.latestBlock = await mevProvider.getBlockNumber();
      const [self] = await Promise.allSettled([this.selfSubmit(txRequest)]);

      const results = { self };

      // Otherwise, return the first fulfilled result among the rest
      for (const key of ['self']) {
        const result = results[key as keyof typeof results];
        if (result.status === 'fulfilled') return result.value;
      }

      // If none fulfilled
      this.logger.warn('submitArbitrage: No submissions succeeded.');
      return undefined;
    } catch (error) {
      this.logger.error('Error in submitArbitrage', error);
      return undefined;
    }
  }

  async submitBeaver(txRequest: TransactionRequest): Promise<string> {
    try {
      // 1. Prepare transaction
      if (!txRequest) return;

      // 2. Sign transaction and prepare bundle
      const signedTx = await signer.signTransaction(txRequest);
      const targetBlock = this.latestBlock + 1;
      this.logger.log(`Prepared bundle for block ${targetBlock}`);

      const payload = {
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_sendBundle',
        params: [
          {
            txs: [signedTx],
            blockNumber: ethers.utils.hexValue(targetBlock),
            refundPercent: 90,
          },
        ],
      };

      // 3. Send bundle
      this.logger.log(
        `Sending bundle to Beaver RPC for block ${targetBlock}...`,
      );

      const response = await axios.post(BEAVER_BUILD_RPC, payload, {
        headers: {
          'Content-Type': 'application/json',
        },
      });

      console.log('Beaver response:', response.data);

      if (response.data.error) {
        this.logger.error('Beaver RPC Error', response.data.error);
        return;
      }

      const { bundleHash } = response.data.result;
      this.logger.log('Bundle submitted successfully, hash:', bundleHash);
      sendNotify({ ...this.params, bundleHash, builder: 'Beaver' });
      return bundleHash;
    } catch (error) {
      this.logger.error('Error during submitArbitrage', error);
    }
  }

  async submitTitan(txRequest: TransactionRequest): Promise<string> {
    try {
      // 1. Prepare transaction
      if (!txRequest) return;

      // 2. Sign transaction and prepare bundle
      const signedTx = await signer.signTransaction(txRequest);
      const targetBlock = this.latestBlock + 1;
      this.logger.log(`Prepared Titan bundle for block ${targetBlock}`);

      const payload = {
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_sendBundle',
        params: [
          {
            txs: [signedTx],
            blockNumber: ethers.utils.hexValue(targetBlock),
            refundPercent: 90,
          },
        ],
      };

      const requestBody = JSON.stringify(payload);
      const signature = await flashBotSigner.signMessage(
        ethers.utils.keccak256(ethers.utils.toUtf8Bytes(requestBody)),
      );

      // 3. Send bundle
      this.logger.log(`Sending bundle to RPC for block ${targetBlock}...`);

      const response = await axios.post(TITAN_RPC, payload, {
        headers: {
          'Content-Type': 'application/json',
          'X-Flashbots-Signature': `${await flashBotSigner.getAddress()}:${signature}`,
        },
      });

      console.log('Titan response:', response.data);

      if (response.data.error) {
        this.logger.error('Titan RPC Error', response.data.error);
        return;
      }

      const { bundleHash } = response.data.result;
      this.logger.log('Titan Bundle submitted successfully, hash:', bundleHash);
      sendNotify({ ...this.params, bundleHash, builder: 'Titan' });
      return bundleHash;
    } catch (error) {
      this.logger.error('Error during submitTitan', error);
    }
  }

  async selfSubmit(txRequest: TransactionRequest): Promise<string> {
    if (!txRequest) return;
    try {
      // 1. Sign transaction
      const signedTx = await signer.signTransaction(txRequest);
      this.logger.debug(`Signed transaction: ${signedTx}`);
      // 2. Send the transaction
      const txResponse = await defaultProvider.sendTransaction(signedTx);
      this.logger.log(`Transaction sent: ${txResponse.hash}`);
      sendNotify({ ...this.params, tx: txResponse.hash });
      return txResponse.hash;
    } catch (e) {
      this.logger.error('Error in selfSubmit', e);
    }
  }
}
