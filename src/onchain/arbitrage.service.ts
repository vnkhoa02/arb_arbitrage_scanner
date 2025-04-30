import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import 'dotenv/config';
import { BigNumber, ethers } from 'ethers';
import { CHAIN_ID } from 'src/dex/config';
import { provider } from 'src/dex/config/provider';
import { STABLE_COIN, TOKENS } from 'src/dex/constants/tokens';
import { ScannerService } from 'src/scanner/scanner.service';
import arbitrageV2Abi from './abis/ArbitrageV2.json';
import simpleArbitrageAbi from './abis/SimpleArbitrage.json';
import { signer } from './config';
import { ARBITRAGE_V2, PUBLIC_ADDRESS, SIMPLE_ARBITRAGE } from './constants';
import { MevService } from './mev.service';
import {
  IFeeData,
  ISimpleArbitrageParams,
  ISimpleArbitrageTrade,
} from './types';
import { processRoute } from './utils';
import { autoParseGasFee, getFeeData } from './utils/getGasFee';

@Injectable()
export class ArbitrageService implements OnModuleInit {
  private readonly logger = new Logger(ArbitrageService.name);
  private feeData: IFeeData;
  private simpleArbContract: ethers.Contract;
  private arbContract: ethers.Contract;

  constructor(
    private readonly scannerService: ScannerService,
    private readonly mevService: MevService,
  ) {}

  async onModuleInit() {
    this.simpleArbContract = new ethers.Contract(
      SIMPLE_ARBITRAGE,
      simpleArbitrageAbi.abi,
      signer,
    );
    this.arbContract = new ethers.Contract(
      ARBITRAGE_V2,
      arbitrageV2Abi.abi,
      signer,
    );
    await this.syncFeeData();
  }

  @Cron(CronExpression.EVERY_HOUR)
  async syncFeeData() {
    try {
      this.logger.log('Syncing Fee Data');
      this.feeData = await getFeeData();
      return this.feeData;
    } catch (error) {
      this.logger.error('Error in syncFeeData', error);
      throw error;
    }
  }

  async getBalance(address = PUBLIC_ADDRESS): Promise<number> {
    const balanceInWei = await provider.getBalance(address);
    const result = ethers.utils.formatEther(balanceInWei); // Converts Wei to Ether
    return Number(result);
  }

  async simulateSimpleArbitrage(trade: ISimpleArbitrageTrade) {
    try {
      const params = await this.getArbitrageTradeParams(trade);
      const promise1 = this.simpleArbContract.callStatic.simpleArbitrage(
        params.tokenIn,
        params.tokenOut,
        params.forwardPaths,
        params.backwardPaths,
        params.borrowAmount,
      );
      const promise2 =
        this.simpleArbContract.populateTransaction.simpleArbitrage(
          params.tokenIn,
          params.tokenOut,
          params.forwardPaths,
          params.backwardPaths,
          params.borrowAmount,
        );

      const [sim, txRequest] = await Promise.all([promise1, promise2]);
      this.logger.debug('sim-->', sim);

      txRequest.chainId = CHAIN_ID;
      txRequest.type = 2;
      txRequest.maxPriorityFeePerGas = autoParseGasFee(
        this.feeData.maxPriorityFeePerGas,
      );
      txRequest.maxFeePerGas = autoParseGasFee(this.feeData.maxFeePerGas);
      txRequest.value = BigNumber.from(0); // don't send ETH accidentally
      txRequest.nonce = await signer.getTransactionCount('latest');
      txRequest.gasLimit = BigNumber.from(1200000);
      return {
        txRequest,
      };
    } catch (err) {
      this.logger.error('simulateSimpleArbitrage failed', err as any);
      return null;
    }
  }

  async simulateArbitrage(trade: ISimpleArbitrageTrade) {
    try {
      console.log('trade', trade);
      const params = await this.getArbitrageTradeParams(trade);
      console.log('params ->', params);
      const promise1 = this.arbContract.callStatic.arbitrageDexes(
        params.tokenIn,
        params.tokenOut,
        params.forwardPaths,
        params.borrowAmount,
      );
      const promise2 = this.arbContract.populateTransaction.arbitrageDexes(
        params.tokenIn,
        params.tokenOut,
        params.forwardPaths,
        params.borrowAmount,
      );

      const [sim, txRequest] = await Promise.all([promise1, promise2]);
      this.logger.debug('arb sim -->', sim);

      txRequest.chainId = CHAIN_ID;
      txRequest.type = 2;
      txRequest.maxPriorityFeePerGas = autoParseGasFee(
        this.feeData.maxPriorityFeePerGas,
      );
      txRequest.maxFeePerGas = autoParseGasFee(this.feeData.maxFeePerGas);
      txRequest.value = BigNumber.from(0); // don't send ETH accidentally
      txRequest.nonce = await signer.getTransactionCount('latest');
      txRequest.gasLimit = BigNumber.from(1200000);
      return {
        txRequest,
      };
    } catch (err) {
      this.logger.error('simulateArbitrage failed', err as any);
      return null;
    }
  }

  /**
   * Prepare ISimpleArbitrageParams params
   * @returns ISimpleArbitrageParams
   */
  private async getArbitrageTradeParams(
    trade: ISimpleArbitrageTrade,
  ): Promise<ISimpleArbitrageParams> {
    const path = await this.scannerService.scan(
      trade.tokenIn,
      trade.tokenOut,
      trade.amountIn,
    );
    const forwardPaths = processRoute(path.forward.route);
    const backwardPaths = processRoute(path.backward.route);
    const tokenInDec = path.forward.route[0][0].tokenIn.decimals;

    const simParams: ISimpleArbitrageParams = {
      tokenIn: trade.tokenIn,
      tokenOut: trade.tokenOut,
      amountIn: trade.amountIn,
      forwardPaths,
      backwardPaths,
      borrowAmount: ethers.utils
        .parseUnits(trade.amountIn.toString(), tokenInDec)
        .toBigInt(),
    };
    return simParams;
  }

  private async submitSimpleArbitrage(
    params: ISimpleArbitrageParams,
  ): Promise<string> {
    const simulate = await this.simulateSimpleArbitrage(params);
    const txRequest = simulate?.txRequest;
    if (!txRequest) return;
    this.logger.log('submitSimpleArbitrage txRequest -->', txRequest);
    return await this.mevService.submitArbitrage(txRequest, params);
  }

  private async submitArbitrage(
    params: ISimpleArbitrageParams,
  ): Promise<string> {
    const simulate = await this.simulateArbitrage(params);
    const txRequest = simulate?.txRequest;
    if (!txRequest) return;
    this.logger.log('submitArbitrage txRequest -->', txRequest);
    return await this.mevService.submitArbitrage(txRequest, params);
  }

  private async handleSimulation(tokenOut: string) {
    try {
      const tradeParams = await this.getArbitrageTradeParams({
        tokenIn: TOKENS.WETH,
        tokenOut,
        amountIn: 1,
      });
      console.log('tradeParams', tradeParams);
      const promise1 = this.submitArbitrage(tradeParams);
      const promise2 = this.submitSimpleArbitrage(tradeParams);
      await Promise.allSettled([promise1, promise2]);
    } catch (error) {
      this.logger.error(`Simulation error for ${tokenOut}`, error);
    }
  }

  @Cron(CronExpression.EVERY_5_SECONDS) // 3s
  private async scanTrade() {
    const balance = await this.getBalance();
    if (balance <= 0.0009) {
      this.logger.warn(
        `Balance too low: ${balance} ETH. Stopping further trades.`,
      );
      return; // Stop further trade execution
    }
    const tokens = [
      STABLE_COIN.USDT,
      STABLE_COIN.USDC,
      STABLE_COIN.DAI,
      TOKENS.WSETH,
    ];
    for (const tokenOut of tokens) {
      this.handleSimulation(tokenOut);
    }
  }
}
