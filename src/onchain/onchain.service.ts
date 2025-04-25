import {
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
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
import { pickBestRoute } from './utils';

const walletPrivateKey = process.env.TESTER_PROD_PRIVATE_KEY;

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
      const tx = await this.contract.simpleArbitrage.staticCall(
        params.tokenIn,
        params.tokenOut,
        params.forwardPath,
        params.forwardOutMin,
        params.backwardPath,
        params.backwardOutMin,
        params.borrowAmount,
      );
      return tx;
    } catch (error) {
      console.error('Simulation failed:', error);
      throw error;
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
    if (!path.roundTrip.isProfitable) {
      const message = 'No arbitrage opportunity found.';
      this.logger.log(message, params);
      throw new NotFoundException(message);
    }

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
      .parseUnits(params.tokenIn.toString(), 18)
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

  async searchSimpleArbitrage(tokenIn = TOKENS.WETH) {
    this.logger.log('Searching for arbitrage trade...');

    const profitableRoutes = [];
    const chunkedPools = chunk(x_weth.slice(0, 500), 10); // Adjust size to control concurrency

    for (const group of chunkedPools) {
      const results = await Promise.all(
        group.map(async (pool) => {
          try {
            this.logger.log(`Checking WETH with `, pool.token0.id);
            const result = await this.scannerService.arbitrage(
              tokenIn,
              pool.token0.id,
              1,
            );
            if (result.roundTrip.isProfitable) {
              return { poolId: pool.id, result };
            }
          } catch (err) {
            this.logger.warn(
              `⚠️ Error in ${pool.token0.symbol} [${pool.id}]: ${err.message}`,
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
