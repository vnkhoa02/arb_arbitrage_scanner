import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import axios from 'axios';
import 'dotenv/config';
import { BigNumber, ethers, Wallet } from 'ethers';
import { provider } from 'src/dex/config/provider';
import { STABLE_COIN, TOKENS } from 'src/dex/config/token';
import { ScannerService } from 'src/scanner/scanner.service';
import arbitrageAbi from './abis/Arbitrage.abi.json';
import { REPLAY_URL } from './config/flashbot';
import { ARBITRAGE_V1 } from './constants';
import { ISimpleArbitrageParams, ISimpleArbitrageTrade } from './types';
import { pickBestRoute } from './utils';
import { getGasFee } from './utils/getGasFee';
import { sendNotify } from './utils/notify';

const PRIVATE_KEY = process.env.PRIVATE_KEY;
@Injectable()
export class OnchainService implements OnModuleInit {
  private readonly logger = new Logger(OnchainService.name);
  private signer: Wallet;
  private arbContract: ethers.Contract;
  private isSent = false;

  constructor(private readonly scannerService: ScannerService) {
    this.signer = new Wallet(PRIVATE_KEY, provider);
  }

  async onModuleInit() {
    this.arbContract = new ethers.Contract(
      ARBITRAGE_V1,
      arbitrageAbi.abi,
      this.signer,
    );
  }

  async simulateSimpleArbitrage(trade: ISimpleArbitrageTrade): Promise<{
    simulatedReturn: string;
  }> {
    try {
      const params = await this.getArbitrageTradeParams(trade);
      const simulatedReturn = await this.arbContract.callStatic.simpleArbitrage(
        params.tokenIn,
        params.tokenOut,
        params.forwardPath,
        0,
        params.backwardPath,
        0,
        params.borrowAmount,
      );
      return simulatedReturn;
    } catch (err) {
      this.logger.error('simulateSimpleArbitrage failed', err as any);
      return null;
    }
  }

  private async getEstArbitrageGas(
    params: ISimpleArbitrageParams,
  ): Promise<BigNumber> {
    try {
      const estimateGas = await this.arbContract.estimateGas.simpleArbitrage(
        params.tokenIn,
        params.tokenOut,
        params.forwardPath,
        0,
        params.backwardPath,
        0,
        params.borrowAmount,
      );

      return estimateGas;
    } catch (err) {
      this.logger.error('getEstArbitrageGas failed', err as any);
      return null;
    }
  }

  /**
   * Prepare ISimpleArbitrageParams params
   * @returns ISimpleArbitrageParams
   */
  async getArbitrageTradeParams(
    trade: ISimpleArbitrageTrade,
  ): Promise<ISimpleArbitrageParams> {
    const path = await this.scannerService.arbitrage(
      trade.tokenIn,
      trade.tokenOut,
      trade.amountIn,
    );
    const forward = pickBestRoute(path.forward.route);
    const backward = pickBestRoute(path.backward.route);
    const simParams: ISimpleArbitrageParams = {
      tokenIn: trade.tokenIn,
      tokenOut: trade.tokenOut,
      forwardPath: forward.encoded,
      forwardOutMin: BigInt(
        ethers.utils
          .parseUnits(path.forward.amountOut.toString(), 18)
          .toString(),
      ),
      backwardPath: backward.encoded,
      backwardOutMin: BigInt(
        ethers.utils
          .parseUnits(path.backward.amountOut.toString(), 18)
          .toString(),
      ),
      borrowAmount: BigInt(
        ethers.utils.parseUnits(trade.amountIn.toString(), 18).toString(),
      ),
      profit: path.roundTrip.profit,
    };
    return simParams;
  }

  private async submitArbitrage(params: ISimpleArbitrageParams) {
    try {
      // 1. Prepare transaction
      const noncePromise = provider.getTransactionCount(
        this.signer.address,
        'latest',
      );
      const txRequest =
        await this.arbContract.populateTransaction.simpleArbitrage(
          params.tokenIn,
          params.tokenOut,
          params.forwardPath,
          0,
          params.backwardPath,
          0,
          params.borrowAmount,
        );

      txRequest.chainId = 1;
      txRequest.type = 2;
      txRequest.nonce = await noncePromise;

      // 2. Estimate gas with 20% buffer
      let gasEstimate = await provider.estimateGas(txRequest);
      gasEstimate = gasEstimate.mul(120).div(100);
      this.logger.debug('Gas estimate (buffered):', gasEstimate.toString());

      const { maxFeePerGas, maxPriorityFeePerGas, estimatedFeeEth } =
        (await getGasFee(gasEstimate)) as {
          maxFeePerGas: BigNumber;
          maxPriorityFeePerGas: BigNumber;
          estimatedFeeEth: string;
        };

      if (Number(params.profit) <= Number(estimatedFeeEth)) {
        this.logger.warn(
          `Profit ${params.profit} ≤ Fee ${estimatedFeeEth}, skipping arbitrage.`,
        );
        return;
      }

      this.isSent = true;

      txRequest.gasLimit = gasEstimate;
      txRequest.maxFeePerGas = maxFeePerGas;
      txRequest.maxPriorityFeePerGas = maxPriorityFeePerGas;

      // 3. Sign transaction and prepare bundle
      const [signedTx, latestBlock] = await Promise.all([
        this.signer.signTransaction(txRequest),
        provider.getBlockNumber(),
      ]);

      const targetBlock = latestBlock + 1;
      this.logger.log(`Prepared bundle for block ${targetBlock}`);

      const payload = {
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_sendBundle',
        params: [
          {
            txs: [signedTx],
            blockNumber: ethers.utils.hexValue(targetBlock),
            refundPercent: 95,
          },
        ],
      };

      // 4. Sign payload
      const payloadStr = JSON.stringify(payload);
      const payloadHash = ethers.utils.keccak256(
        ethers.utils.toUtf8Bytes(payloadStr),
      );
      const [signature, publicAddress] = await Promise.all([
        this.signer.signMessage(ethers.utils.arrayify(payloadHash)),
        this.signer.getAddress(),
      ]);

      // 5. Send bundle
      this.logger.log(`Sending bundle to Titan for block ${targetBlock}...`);

      const response = await axios.post(REPLAY_URL, payload, {
        headers: {
          'Content-Type': 'application/json',
          'X-Flashbots-Signature': `${publicAddress}:${signature}`,
        },
      });

      if (response.data.error) {
        this.logger.error('Titan RPC Error', response.data.error);
        return;
      }

      const { bundleHash } = response.data.result;
      this.logger.log('Bundle submitted successfully, hash:', bundleHash);
      sendNotify({ ...params, bundleHash });
    } catch (error) {
      this.logger.error('Error during submitArbitrage', error);
    }
  }

  @Cron(CronExpression.EVERY_5_SECONDS)
  private async scanTrade() {
    if (this.isSent) {
      console.log('Trade already sent!', this.isSent);
      return;
    }
    const stableCoins = [STABLE_COIN.USDT, STABLE_COIN.USDC, STABLE_COIN.DAI];
    const promises = stableCoins.map(async (tokenOut) => {
      try {
        const simParams = await this.getArbitrageTradeParams({
          tokenIn: TOKENS.WETH,
          tokenOut,
          amountIn: 1,
        });

        if (simParams) {
          return { simParams, success: true };
        }
      } catch (error) {
        console.error(`Error during simulation for ${tokenOut}`, error);
      }
      return { success: false };
    });

    const results = await Promise.allSettled(promises);

    for (const result of results) {
      if (result.status === 'fulfilled' && result.value.success) {
        try {
          const { simParams } = result.value;
          if (Number(simParams.profit) <= 0) continue;
          await this.submitArbitrage(simParams);
          console.log('Successfully submitted arbitrage!');
          return; // Only send the first successful one
        } catch (error) {
          console.error('Error in submitArbitrage', error);
        }
      }
    }
  }
}
