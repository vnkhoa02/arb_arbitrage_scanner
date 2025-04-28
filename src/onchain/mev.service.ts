import { TransactionRequest } from '@ethersproject/abstract-provider';
import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { ethers } from 'ethers';
import { defaultProvider, mevProvider } from 'src/dex/config/provider';
import {
  BEAVER_BUILD_RPC,
  FLASH_BOT_RPC,
  flashBotSigner,
  mevSigner,
  signer,
  TITAN_RPC,
} from './config';
import { sendNotify } from './utils/notify';
import { ISimpleArbitrageParams } from './types';

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
      const [beaver, flashbot, titan, self, selfMev] = await Promise.allSettled(
        [
          this.submitBeaver(txRequest),
          this.submitFlashbot(txRequest),
          this.submitTitan(txRequest),
          this.selfSubmit(txRequest),
          this.selfSubmitMev(txRequest),
        ],
      );

      const results = { beaver, flashbot, titan, self, selfMev };

      // Otherwise, return the first fulfilled result among the rest
      for (const key of ['beaver', 'flashbot', 'titan', 'self', 'selfMev']) {
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
            minTimestamp: 0,
            maxTimestamp: 0,
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

  async submitFlashbot(txRequest: TransactionRequest): Promise<string> {
    try {
      // 1. Prepare transaction
      if (!txRequest) return;

      // 2. Sign transaction and prepare bundle
      const signedTx = await mevSigner.signTransaction(txRequest);
      const targetBlock = this.latestBlock + 1;
      this.logger.log(`Prepared Flashbot bundle for block ${targetBlock}`);

      const payload = {
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_sendBundle',
        params: [
          {
            txs: [signedTx],
            blockNumber: ethers.utils.hexValue(targetBlock),
            minTimestamp: 0,
            maxTimestamp: 0,
          },
        ],
      };

      const requestBody = JSON.stringify(payload);
      const signature = await flashBotSigner.signMessage(
        ethers.utils.keccak256(ethers.utils.toUtf8Bytes(requestBody)),
      );

      // 3. Send bundle
      this.logger.log(
        `Sending bundle to Flashbot RPC for block ${targetBlock}...`,
      );

      const response = await axios.post(FLASH_BOT_RPC, payload, {
        headers: {
          'Content-Type': 'application/json',
          'X-Flashbots-Signature': `${await flashBotSigner.getAddress()}:${signature}`,
        },
      });

      console.log('Flashbots response:', response.data);

      if (response.data.error) {
        this.logger.error('Flashbots RPC Error', response.data.error);
        return;
      }

      const { bundleHash } = response.data.result;
      this.logger.log(
        'Flashbot Bundle submitted successfully, hash:',
        bundleHash,
      );
      sendNotify({ ...this.params, bundleHash, builder: 'Flashbot' });
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
            minTimestamp: 0,
            maxTimestamp: 0,
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

  async selfSubmitMev(txRequest: TransactionRequest): Promise<string> {
    try {
      // 1. Prepare transaction
      if (!txRequest) return;

      // 2. Sign transaction
      const signedTx = await mevSigner.signTransaction(txRequest);
      this.logger.debug(`Signed transaction: ${signedTx}`);

      // 3. Send the transaction
      const txResponse = await mevProvider.sendTransaction(signedTx);
      this.logger.log(`Transaction sent: ${txResponse.hash}`);
      sendNotify({ ...this.params, tx: txResponse.hash });
      return txResponse.hash;
    } catch (error) {
      this.logger.error('Error during self selfSubmitMev', error);
    }
  }

  async selfSubmit(txRequest: TransactionRequest): Promise<string> {
    try {
      // 1. Prepare transaction
      if (!txRequest) return;

      // 2. Sign transaction
      const signedTx = await signer.signTransaction(txRequest);
      this.logger.debug(`Signed transaction: ${signedTx}`);

      // 3. Send the transaction
      const txResponse = await defaultProvider.sendTransaction(signedTx);
      this.logger.log(`Transaction sent: ${txResponse.hash}`);
      sendNotify({ ...this.params, tx: txResponse.hash });
      return txResponse.hash;
    } catch (error) {
      this.logger.error('Error during selfSubmit', error);
    }
  }
}
