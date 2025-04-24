import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ethers } from 'ethers';
import { provider } from './config/provider';
import { DEX } from './config/token';
import { DexService } from './dex.service';
import { ArbPathResult } from './types';

@Injectable()
export class SushiSwapDexService extends DexService {
  private readonly sushiLogger = new Logger(SushiSwapDexService.name);

  /**
   * Get a quote for a token swap using the Uniswap Quoter contract.
   * @param tokenIn The address of the input token.
   * @param tokenOut The address of the output token.
   * @param amountIn The amount of the input token.
   * @param fee The fee tier of the Uniswap pool (e.g., 500, 3000, 10000).
   * @param decimalOut The number of decimals for the output token (default is 6).
   * @returns The quoted amount of the output token.
   */
  async getQuote(
    tokenIn: string,
    tokenOut: string,
    amountIn: string,
  ): Promise<string> {
    const sushiRouterABI = [
      'function getAmountsOut(uint amountIn, address[] memory path) external view returns (uint[] memory)',
    ];
    try {
      const [decIn, decOut] = await Promise.all([
        this.getTokenDecimals(tokenIn),
        this.getTokenDecimals(tokenOut),
      ]);
      const amountInUnits = ethers.parseUnits(amountIn, decIn);

      const sushiRouter = new ethers.Contract(
        DEX.sushiswap.router,
        sushiRouterABI,
        provider,
      );

      const path = [tokenIn, tokenOut];
      const results: bigint[] = await sushiRouter.getAmountsOut(
        amountInUnits,
        path,
      );
      const amountOut = results[1];
      const amountOutUnits = ethers.formatUnits(amountOut, decOut);
      return amountOutUnits;
    } catch (error) {
      this.sushiLogger.error('Error getting quote:', error);
      throw new BadRequestException(`Error getting quote: ${error.message}`);
    }
  }

  /** Evaluate a single-direction arbitrage leg and return fee & price. */
  async evaluateArbitrage(
    tokenIn: string,
    tokenOut: string,
    amountIn: number | string,
  ): Promise<ArbPathResult> {
    const amountOut = await this.getQuote(
      tokenIn,
      tokenOut,
      amountIn.toString(),
    );
    const value = Number(amountOut) * Number(amountIn);
    return {
      value: value.toString(),
      amountOut: amountOut.toString(),
      amountIn,
      tokenIn,
      tokenOut,
    };
  }
}
