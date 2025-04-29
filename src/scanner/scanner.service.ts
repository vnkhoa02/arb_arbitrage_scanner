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
    const backward: ArbPathResult = await this.dexService.evaluateArbitrageV3(
      tokenOut,
      tokenIn,
      amountOut,
    );

    return backward;
  }

  /** Perform both forward and backward legs and return full ArbPath */
  async scan(
    tokenIn: string,
    tokenOut: string,
    amountIn: number,
  ): Promise<ArbPath> {
    const forward = await this.dexService.evaluateArbitrageV3(
      tokenIn,
      tokenOut,
      amountIn,
    );
    const backward = await this.scanBackwards(forward);
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
