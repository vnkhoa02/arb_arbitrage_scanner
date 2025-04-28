import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import retry from 'async-await-retry';
import 'dotenv/config';
import { BigNumber, ethers } from 'ethers';
import { STABLE_COIN, TOKENS } from 'src/dex/config/token';
import { ScannerService } from 'src/scanner/scanner.service';
import arbitrageAbi from './abis/Arbitrage.abi.json';
import { signer } from './config';
import { ARBITRAGE_V1 } from './constants';
import { MevService } from './mev.service';
import {
  IFeeData,
  ISimpleArbitrageParams,
  ISimpleArbitrageTrade,
} from './types';
import { pickBestRoute } from './utils';
import { autoParseGasFee, getFeeData } from './utils/getGasFee';

@Injectable()
export class OnchainService implements OnModuleInit {
  private readonly logger = new Logger(OnchainService.name);
  private feeData: IFeeData;
  private arbContract: ethers.Contract;
  private totalTrade = 0;

  constructor(
    private readonly scannerService: ScannerService,
    private readonly mevService: MevService,
  ) {}

  async onModuleInit() {
    this.arbContract = new ethers.Contract(
      ARBITRAGE_V1,
      arbitrageAbi.abi,
      signer,
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
      // Use retry for the logic
      const result = await retry(
        async () => {
          const params = await this.getArbitrageTradeParams(trade);
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

          const [sim, txRequest] = await Promise.all([promise1, promise2]);

          txRequest.chainId = 1;
          txRequest.type = 2;
          txRequest.maxPriorityFeePerGas = autoParseGasFee(
            this.feeData.maxPriorityFeePerGas,
          );
          txRequest.maxFeePerGas = autoParseGasFee(this.feeData.maxFeePerGas);
          txRequest.value = BigNumber.from(0); // don't send ETH accidentally
          txRequest.nonce = await signer.getTransactionCount('latest');
          // let gasEstimate = await mevProvider.estimateGas(txRequest);
          let gasEstimate = BigNumber.from(50000);
          // let gasEstimate = BigNumber.from(50000);
          this.logger.debug(`Gas estimate: ${gasEstimate.toString()}`);
          gasEstimate = gasEstimate.mul(115).div(100); // 15% buffer
          this.logger.debug(
            `Gas estimate (buffered): ${gasEstimate.toString()}`,
          );
          txRequest.gasLimit = gasEstimate;
          return {
            sim,
            txRequest,
            gasEstimate,
          };
        },
        null,
        { retriesMax: 3, interval: 50, exponential: false },
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

  private async submitArbitrage(
    params: ISimpleArbitrageParams,
  ): Promise<string> {
    const simulate = await this.simulateSimpleArbitrage(params);
    const txRequest = simulate?.txRequest;
    console.log('txRequest -->', txRequest);
    return await this.mevService.submitArbitrage(txRequest, params);
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
      const txHash = await this.submitArbitrage(simParams);
      if (txHash) {
        this.totalTrade++;
        this.logger.log('Arbitrage submitted successfully!');
      }
    } catch (error) {
      this.logger.error(`Simulation error for ${tokenOut}`, error);
    }
  }

  @Cron(CronExpression.EVERY_5_SECONDS)
  private async scanTrade() {
    if (this.totalTrade > 5) {
      this.logger.warn('Max trade reached', this.totalTrade);
      return;
    }
    const tokens = [
      STABLE_COIN.USDT,
      STABLE_COIN.USDC,
      STABLE_COIN.DAI,
      TOKENS.SHIB,
      TOKENS.WSTETH,
    ];
    for (const tokenOut of tokens) {
      this.handleSimulation(tokenOut);
    }
  }
}
