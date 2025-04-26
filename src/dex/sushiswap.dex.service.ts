import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { DexService } from './dex.service';
import { ArbPathResult } from './types';

import { ethers } from 'ethers';
import axios from 'axios';
import { SUSHI_SWAP_QUOTE_API } from './constants';
import { ISushiQuote } from './types/sushi/quote';

@Injectable()
export class SushiSwapService extends DexService {
  private readonly sushiLogger = new Logger(SushiSwapService.name);

  /**
   * Get a quote for a token swap using the SushiSwap Router contract.
   * @param tokenIn The address of the input token.
   * @param tokenOut The address of the output token.
   * @param amountIn The amount of the input token.
   * @returns The quoted amount of the output token.
   */
  async sushiQuote(tokenIn: string, tokenOut: string, amountIn: string) {
    try {
      const decIn = await this.getTokenDecimals(tokenIn);
      const amountInUnits = ethers.utils.parseUnits(amountIn, decIn);
      const params = new URLSearchParams({
        referrer: 'sushi',
        tokenIn,
        tokenOut,
        amount: amountInUnits.toString(),
        maxSlippage: '0.005',
        fee: '0.0025',
        feeBy: 'output',
      });
      const quote = await axios.get<ISushiQuote>(
        `${SUSHI_SWAP_QUOTE_API}?${params.toString()}`,
      );
      return quote.data;
    } catch (error) {
      this.sushiLogger.error('Error getting quote:', error);
      throw new BadRequestException(`Error getting quote: ${error.message}`);
    }
  }

  /** Evaluate a single-direction arbitrage leg and return fee & price. */
  override async evaluateArbitrage(
    tokenIn: string,
    tokenOut: string,
    amountIn: number | string,
  ): Promise<ArbPathResult> {
    const { amountOut, route } = await this.getQuote(
      tokenIn,
      tokenOut,
      amountIn.toString(),
    );
    return {
      route,
      amountOut,
      amountIn,
      tokenIn,
      tokenOut,
    };
  }
}
