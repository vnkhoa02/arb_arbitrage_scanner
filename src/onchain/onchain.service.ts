import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import axios from 'axios';
import 'dotenv/config';
import { ethers, Wallet } from 'ethers';
import { mevProvider, provider } from 'src/dex/config/provider';
import { STABLE_COIN, TOKENS } from 'src/dex/config/token';
import { ScannerService } from 'src/scanner/scanner.service';
import arbitrageAbi from './abis/Arbitrage.abi.json';
import { FLASH_BOT_RPC, flashBotSigner } from './config/flashbot';
import { ARBITRAGE_V1 } from './constants';
import {
  IFeeData,
  ISimpleArbitrageParams,
  ISimpleArbitrageTrade,
} from './types';
import { pickBestRoute } from './utils';
import { getFeeData } from './utils/getGasFee';
import { sendNotify } from './utils/notify';
import retry from 'async-await-retry';

const PRIVATE_KEY = process.env.PRIVATE_KEY;
@Injectable()
export class OnchainService implements OnModuleInit {
  private readonly logger = new Logger(OnchainService.name);
  private feeData: IFeeData;
  private signer: Wallet;
  private arbContract: ethers.Contract;
  private totalTrade = 0;

  constructor(private readonly scannerService: ScannerService) {
    this.signer = new Wallet(PRIVATE_KEY, mevProvider);
  }

  async onModuleInit() {
    this.arbContract = new ethers.Contract(
      ARBITRAGE_V1,
      arbitrageAbi.abi,
      this.signer,
    );
    await this.syncFeeData();
  }

  @Cron(CronExpression.EVERY_HOUR)
  async syncFeeData() {
    try {
      this.logger.log('Syncing Fee Data');
      this.feeData = await getFeeData();
      this.logger.log('FeeData Sycned');
      return this.feeData;
    } catch (error) {
      this.logger.error('Error in syncFeeData', error);
      throw error;
    }
  }

  async simulateSimpleArbitrage(trade: ISimpleArbitrageTrade) {
    try {
      const params = await this.getArbitrageTradeParams(trade);

      // Use retry for the logic
      const result = await retry(
        async () => {
          const promise1 = this.arbContract.callStatic.simpleArbitrage(
            params.tokenIn,
            params.tokenOut,
            params.forwardPath,
            0,
            params.backwardPath,
            0,
            params.borrowAmount,
          );
          const promise2 = this.arbContract.populateTransaction.simpleArbitrage(
            params.tokenIn,
            params.tokenOut,
            params.forwardPath,
            0,
            params.backwardPath,
            0,
            params.borrowAmount,
          );
          const [simulate, txRequest] = await Promise.all([promise1, promise2]);

          txRequest.chainId = 1;
          txRequest.type = 2;
          txRequest.maxPriorityFeePerGas = ethers.utils.parseUnits(
            this.feeData.maxPriorityFeePerGas.toString(),
            'gwei',
          ); // tip to miners
          txRequest.maxFeePerGas = ethers.utils.parseUnits(
            this.feeData.maxFeePerGas.toString(),
            'gwei',
          ); // total max per gas unit
          txRequest.nonce = await this.signer.getTransactionCount('latest');

          let gasEstimate = await mevProvider.estimateGas(txRequest);
          this.logger.debug(`Gas estimate: ${gasEstimate.toString()}`);
          gasEstimate = gasEstimate.mul(110).div(100); // 10% buffer
          this.logger.debug(
            `Gas estimate (buffered): ${gasEstimate.toString()}`,
          );

          txRequest.gasLimit = gasEstimate;

          return {
            simulate,
            txRequest,
            gasEstimate,
          };
        },
        null,
        { retriesMax: 3, interval: 0, exponential: false },
      );

      return result;
    } catch (err) {
      this.logger.error('simulateSimpleArbitrage failed', err as any);
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
      amountIn: trade.amountIn,
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
      const simulate = await this.simulateSimpleArbitrage(params);
      const txRequest = simulate?.txRequest;
      if (!txRequest) return;

      // 2. Sign transaction and prepare bundle
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
            minTimestamp: 0,
            maxTimestamp: 0,
          },
        ],
      };

      this.logger.debug('payload ->', payload);

      const requestBody = JSON.stringify(payload);
      const signature = await flashBotSigner.signMessage(
        ethers.utils.keccak256(ethers.utils.toUtf8Bytes(requestBody)),
      );

      // 3. Send bundle
      this.logger.log(`Sending bundle to RPC for block ${targetBlock}...`);

      const response = await axios.post(FLASH_BOT_RPC, payload, {
        headers: {
          'Content-Type': 'application/json',
          'X-Flashbots-Signature': `${await flashBotSigner.getAddress()}:${signature}`,
        },
      });

      console.log('Flashbots response:', response.data);

      if (response.data.error) {
        this.logger.error('RPC Error', response.data.error);
        return;
      }

      const { bundleHash } = response.data.result;
      this.logger.log('Bundle submitted successfully, hash:', bundleHash);
      return bundleHash;
    } catch (error) {
      this.logger.error('Error during submitArbitrage', error);
    }
  }

  private async selfSubmitArbitrage(params: ISimpleArbitrageParams) {
    try {
      // 1. Prepare transaction
      const simulate = await this.simulateSimpleArbitrage(params);
      const txRequest = simulate?.txRequest;
      if (!txRequest) return;

      // 2. Sign transaction
      const signedTx = await this.signer.signTransaction(txRequest);
      this.logger.debug(`Signed transaction: ${signedTx}`);

      // 3. Send the transaction
      const txResponse = await mevProvider.sendTransaction(signedTx);
      this.logger.log(`Transaction sent: ${txResponse.hash}`);

      return txResponse.hash;
    } catch (error) {
      this.logger.error('Error during self submitArbitrage', error);
    }
  }

  private async handleSimulation(tokenOut: string) {
    try {
      const simParams = await this.getArbitrageTradeParams({
        tokenIn: TOKENS.WETH,
        tokenOut,
        amountIn: 1,
      });

      // const minProfit = 0.00035; // ~0.63$ today
      // if (Number(simParams.profit) <= minProfit) return;

      const minProfit = 0.0001; // ~0.18$ today
      if (Number(simParams.profit) <= minProfit) return;

      this.logger.log(
        `Profitable arbitrage via ${tokenOut}: Profit ${simParams.profit}`,
      );
      const txHash = await this.selfSubmitArbitrage(simParams);
      if (txHash) {
        this.totalTrade++;
        sendNotify({ ...simParams, tx: txHash });
        this.logger.log('Arbitrage submitted successfully!');
      }
    } catch (error) {
      console.error(`Simulation error for ${tokenOut}`, error);
    }
  }

  @Cron(CronExpression.EVERY_5_SECONDS)
  private scanTrade() {
    if (this.totalTrade > 0) {
      this.logger.warn('Max trade reached', this.totalTrade);
      return;
    }
    const stableCoins = [STABLE_COIN.USDT, STABLE_COIN.USDC];
    for (const tokenOut of stableCoins) {
      this.handleSimulation(tokenOut);
    }
  }
}
