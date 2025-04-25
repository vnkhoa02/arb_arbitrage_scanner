import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import 'dotenv/config';
import { ethers } from 'ethers';
import chunk from 'lodash/chunk';
import { provider } from 'src/dex/config/provider';
import { TOKENS } from 'src/dex/config/token';
import { x_weth } from 'src/dex/constants/simplePool';
import { ScannerService } from 'src/scanner/scanner.service';
import * as arbitrageAbi from './abis/Arbitrage.abi.json';
import { ARBITRAGE_V1 } from './constants';
import { ISimpleArbitrageParams, ISimpleArbitrageTrade } from './types';
import { getUniqueToken0Ids, pickBestRoute } from './utils';

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
  ): Promise<string> {
    try {
      const tx = await this.contract.callStatic.simpleArbitrage(
        params.tokenIn,
        params.tokenOut,
        params.forwardPath,
        0,
        params.backwardPath,
        0,
        params.borrowAmount,
      );
      return tx;
    } catch (error) {
      console.error('Simulation failed:', error?.message);
      return null;
    }
  }

  async simpleArbitrageTrade(params: ISimpleArbitrageTrade): Promise<string> {
    const { tokenIn, tokenOut, amountIn } = params;
    const path = await this.scannerService.arbitrage(
      tokenIn,
      tokenOut,
      amountIn,
    );

    // 2) skip if not profitable
    // if (!path.roundTrip.isProfitable) {
    //   const message = 'No arbitrage opportunity found.';
    //   this.logger.log(message, params);
    //   throw new NotFoundException(message);
    // }

    // 3) Destructure the two encoded routes (bytes)
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
    const tx = await this.simulateSimpleArbitrage(simulateParams);
    console.log('tx --->', tx);
    return tx;
  }

  async searchSimpleArbitrage(tokenIn = TOKENS.WETH, amountIn = 1) {
    this.logger.log('Searching for arbitrage trade...');

    const profitableRoutes = [];
    const tokens = getUniqueToken0Ids(x_weth);
    const chunkedTokens = chunk(tokens, 10); // Adjust size to control concurrency

    for (const group of chunkedTokens) {
      const results = await Promise.all(
        group.map(async (tokenOut) => {
          try {
            this.logger.log(`Checking WETH with `, tokenOut);
            const params = { tokenIn, tokenOut, amountIn };
            const tx = await this.simpleArbitrageTrade(params);
            if (tx) {
              this.logger.log(`✅ Profitable arbitrage in ${tokenOut} `, tx);
              return { tokenOut, tx };
            }
          } catch (err) {
            this.logger.warn(
              `⚠️ Error in tokenOut ${tokenOut}: ${err.message}`,
            );
          }
          return null;
        }),
      );

      profitableRoutes.push(...results.filter(Boolean));
    }

    return profitableRoutes;
  }
}
