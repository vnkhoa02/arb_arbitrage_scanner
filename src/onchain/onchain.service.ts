import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import 'dotenv/config';
import { ethers } from 'ethers';
import { provider } from 'src/dex/config/provider';
import { STABLE_COIN, TOKENS } from 'src/dex/config/token';
import { ScannerService } from 'src/scanner/scanner.service';
import * as arbitrageAbi from './abis/Arbitrage.abi.json';
import { ARBITRAGE_V1 } from './constants';
import { ISimpleArbitrageParams, ISimpleArbitrageTrade } from './types';
import { pickBestRoute } from './utils';
import { sendNotify } from './utils/notify';

const walletPrivateKey = process.env.PRIVATE_KEY;

@Injectable()
export class OnchainService implements OnModuleInit {
  private readonly logger = new Logger(OnchainService.name);

  private contract: ethers.Contract;
  private signer = new ethers.Wallet(walletPrivateKey, provider);

  constructor(private readonly scannerService: ScannerService) {}

  onModuleInit() {
    this.contract = new ethers.Contract(
      ARBITRAGE_V1,
      arbitrageAbi.abi,
      this.signer,
    );
  }

  async getOwner(): Promise<string> {
    return this.contract.owner();
  }

  async getSwapRouterAddress(): Promise<string> {
    return this.contract.swapRouter();
  }

  private async simulateSimpleArbitrage(
    params: ISimpleArbitrageParams,
  ): Promise<{ tx: string; gasEstimate: string }> {
    try {
      const promise1 = this.contract.callStatic.simpleArbitrage(
        params.tokenIn,
        params.tokenOut,
        params.forwardPath,
        0,
        params.backwardPath,
        0,
        params.borrowAmount,
      );

      const promise2 = this.contract.estimateGas.simpleArbitrage(
        params.tokenIn,
        params.tokenOut,
        params.forwardPath,
        0,
        params.backwardPath,
        0,
        params.borrowAmount,
      );

      const [tx, gasEstimate] = await Promise.all([promise1, promise2]);

      return { tx, gasEstimate: gasEstimate.toString() };
    } catch (error) {
      console.error('Simulation failed:', error?.message);
      return null;
    }
  }

  async simpleArbitrageTrade(params: ISimpleArbitrageTrade) {
    const { tokenIn, tokenOut, amountIn } = params;
    const path = await this.scannerService.arbitrage(
      tokenIn,
      tokenOut,
      amountIn,
    );

    // Destructure the two encoded routes (bytes)
    const forwardRoute = pickBestRoute(path.forward.route);
    const forwardOutMin = ethers.utils
      .parseUnits(path.forward.amountOut.toString(), 18)
      .toBigInt();
    const backwardRoute = pickBestRoute(path.backward.route);
    const backwardOutMin = ethers.utils
      .parseUnits(path.backward.amountOut.toString(), 18)
      .toBigInt();
    const borrowAmount = ethers.utils
      .parseUnits(params.amountIn.toString(), 18)
      .toBigInt();

    const simulateParams: ISimpleArbitrageParams = {
      tokenIn,
      tokenOut,
      forwardPath: forwardRoute.encoded,
      forwardOutMin,
      backwardPath: backwardRoute.encoded,
      backwardOutMin,
      borrowAmount,
    };
    const trade = await this.simulateSimpleArbitrage(simulateParams);
    return {
      trade,
      simulateParams,
    };
  }

  @Cron(CronExpression.EVERY_5_SECONDS)
  private scanTrade() {
    this.simpleArbitrageTrade({
      tokenIn: TOKENS.WETH,
      amountIn: 1,
      tokenOut: STABLE_COIN.USDT,
    }).then(({ trade, simulateParams }) => sendNotify(trade, simulateParams));
    this.simpleArbitrageTrade({
      tokenIn: TOKENS.WETH,
      amountIn: 1,
      tokenOut: STABLE_COIN.USDC,
    }).then(({ trade, simulateParams }) => sendNotify(trade, simulateParams));
    this.simpleArbitrageTrade({
      tokenIn: TOKENS.WETH,
      amountIn: 1,
      tokenOut: STABLE_COIN.DAI,
    }).then(({ trade, simulateParams }) => sendNotify(trade, simulateParams));
  }
}
