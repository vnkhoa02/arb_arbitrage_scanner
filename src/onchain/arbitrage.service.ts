import { TransactionRequest } from '@ethersproject/abstract-provider';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import retry from 'async-await-retry';
import 'dotenv/config';
import { BigNumber, ethers } from 'ethers';
import { CHAIN_ID } from 'src/dex/config';
import { provider } from 'src/dex/config/provider';
import { STABLE_COIN, TOKENS } from 'src/dex/constants/tokens';
import { ScannerService } from 'src/scanner/scanner.service';
import simpleArbitrageAbi from './abis/SimpleArbitrage.abi.json';
import { signer } from './config';
import { PUBLIC_ADDRESS, SIMPLE_ARBITRAGE } from './constants';
import { MevService } from './mev.service';
import {
  IFeeData,
  ISimpleArbitrageParams,
  ISimpleArbitrageTrade,
} from './types';
import { pickBestRoute } from './utils';
import { autoParseGasFee, getFeeData } from './utils/getGasFee';

@Injectable()
export class ArbitrageService implements OnModuleInit {
  private readonly logger = new Logger(ArbitrageService.name);
  private feeData: IFeeData;
  private simpleArbContract: ethers.Contract;

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

  private async getEsitmateGas(
    txRequest: TransactionRequest,
  ): Promise<BigNumber> {
    try {
      return await retry(
        async () => {
          const gasEstimate = await provider.estimateGas(txRequest);
          this.logger.debug(`Gas estimate: ${gasEstimate.toString()}`);
          return gasEstimate;
        },
        null,
        {
          retriesMax: 5,
          interval: 50,
        },
      );
    } catch (error) {
      throw error;
    }
  }

  async simulateSimpleArbitrage(trade: ISimpleArbitrageTrade) {
    try {
      const params = await this.getArbitrageTradeParams(trade);

      const txRequest =
        await this.simpleArbContract.populateTransaction.simpleArbitrage(
          params.tokenIn,
          params.tokenOut,
          params.forwardPath,
          0,
          params.backwardPath,
          0,
          params.borrowAmount,
        );

      txRequest.chainId = CHAIN_ID;
      txRequest.type = 2;
      txRequest.maxPriorityFeePerGas = autoParseGasFee(
        this.feeData.maxPriorityFeePerGas,
      );
      txRequest.maxFeePerGas = autoParseGasFee(this.feeData.maxFeePerGas);
      txRequest.value = BigNumber.from(0); // don't send ETH accidentally
      txRequest.nonce = await signer.getTransactionCount('latest');

      txRequest.gasLimit = await this.getEsitmateGas(txRequest);
      return {
        txRequest,
      };
    } catch (err) {
      this.logger.error('simulateSimpleArbitrage failed', err as any);
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
    const forward = pickBestRoute(path.forward.route);
    const backward = pickBestRoute(path.backward.route);
    const tokenInDec = forward.route[0].tokenIn.decimals;
    const tokenOutDec =
      backward.route[backward.route.length - 1].tokenOut.decimals;
    const simParams: ISimpleArbitrageParams = {
      tokenIn: trade.tokenIn,
      tokenOut: trade.tokenOut,
      amountIn: trade.amountIn,
      forwardPath: forward.encoded,
      forwardOutMin: BigInt(
        ethers.utils
          .parseUnits(path.forward.amountOut.toString(), tokenInDec)
          .toString(),
      ),
      backwardPath: backward.encoded,
      backwardOutMin: BigInt(
        ethers.utils
          .parseUnits(path.backward.amountOut.toString(), tokenOutDec)
          .toString(),
      ),
      borrowAmount: BigInt(
        ethers.utils
          .parseUnits(trade.amountIn.toString(), tokenInDec)
          .toString(),
      ),
    };
    return simParams;
  }

  private async submitArbitrage(
    params: ISimpleArbitrageParams,
  ): Promise<string> {
    const simulate = await this.simulateSimpleArbitrage(params);
    const txRequest = simulate?.txRequest;
    if (!txRequest) return;
    this.logger.log('txRequest -->', txRequest);
    return await this.mevService.submitArbitrage(txRequest, params);
  }

  private async handleSimulation(tokenOut: string) {
    try {
      const simParams = await this.getArbitrageTradeParams({
        tokenIn: TOKENS.WETH,
        tokenOut,
        amountIn: 1,
      });

      const txHash = await this.submitArbitrage(simParams);
      if (txHash) {
        this.logger.log('Arbitrage submitted successfully!');
      }
    } catch (error) {
      this.logger.error(`Simulation error for ${tokenOut}`, error);
    }
  }

  @Cron('*/3 * * * * *') // 3s
  private async scanTrade() {
    const balance = await this.getBalance();
    if (balance <= 0.001) {
      this.logger.warn(
        `Balance too low: ${balance} ETH. Stopping further trades.`,
      );
      return; // Stop further trade execution
    } else {
      this.logger.log(`Current Balance ${balance} ETH`);
    }
    const tokens = [
      STABLE_COIN.USDT,
      STABLE_COIN.USDC,
      STABLE_COIN.DAI,
      TOKENS.LINK,
      TOKENS.WSETH,
    ];
    for (const tokenOut of tokens) {
      this.handleSimulation(tokenOut);
    }
  }
}
