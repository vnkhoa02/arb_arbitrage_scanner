import { Injectable, Logger } from '@nestjs/common';
import { ArbPath, ArbPathResult } from 'src/dex/types';
import { DexService } from '../dex/dex.service';

@Injectable()
export class ScannerService {
  private readonly logger = new Logger(ScannerService.name);

  constructor(private readonly dexService: DexService) {}

  private async scanBackwards(forward: ArbPathResult): Promise<ArbPathResult> {
    const tokenIn = forward.tokenIn;
    const tokenOut = forward.tokenOut;
    const amountOut = forward.amountOut;
    const backward: ArbPathResult = await this.dexService.evaluateArbitrage(
      tokenOut,
      tokenIn,
      amountOut,
    );

    return backward;
  }

  /** Perform both forward and backward legs and return full ArbPath */
  async arbitrage(
    tokenIn: string,
    tokenOut: string,
    amountIn: number,
  ): Promise<ArbPath> {
    const [forward, backward] = await Promise.all([
      this.dexService.evaluateArbitrage(tokenIn, tokenOut, amountIn),
      this.dexService
        .evaluateArbitrage(tokenIn, tokenOut, amountIn)
        .then((f) => this.scanBackwards(f)),
    ]);

    const profit = Number(backward.amountOut) - Number(forward.amountIn);

    return {
      forward,
      backward,
      roundTrip: {
        profit: profit.toString(),
        isProfitable: profit > 0,
        route: [...forward.route, ...backward.route],
      },
    };
  }
}
