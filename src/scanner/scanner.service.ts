import { Injectable } from '@nestjs/common';
import { DexService } from '../dex/dex.service';
import { ArbPath, ArbPathResult, ArbRoundTrip } from 'src/dex/types';

@Injectable()
export class ScannerService {
  constructor(private readonly dexService: DexService) {}

  async scanBackwards(forward: ArbPathResult): Promise<ArbPathResult> {
    // Now we have the tokenOut and amountOut, we need to find the tokenIn
    // that can be swapped to get the amountOut & has total value > forwadValue

    const forwadValue = Number(forward.amountIn) * Number(forward.price);
    const tokenIn = forward.tokenIn;
    const tokenOut = forward.tokenOut;
    const amountOut = forward.amountOut;

    // Get quotes for tokenOut on all available pairs. Now we get tokenOut/tokenTemp
    // Then get quotes for tokenTemp/tokenIn. Compare the total value with `forwadValue`

    const backward: ArbPathResult = await this.dexService.evaluateArbitrage(
      tokenOut,
      tokenIn,
      amountOut,
    );
    return backward;
  }

  /** Perform both forward and backward legs and return full ArbPath */
  async simpleArbitrage(
    tokenIn: string,
    tokenOut: string,
    amountIn: number,
  ): Promise<ArbPath> {
    // Forward leg
    const forward: ArbPathResult = await this.dexService.evaluateArbitrage(
      tokenIn,
      tokenOut,
      amountIn,
    );
    // Backward leg: swapping amountOut of tokenOut back to tokenIn
    const backward: ArbPathResult = await this.scanBackwards(forward);

    // Round-trip profit in original tokenIn
    const forwardTotal = Number(forward.amountIn) * Number(forward.price);
    const backwardTotal = Number(backward.amountIn) * Number(backward.price);
    const profit = backwardTotal - forwardTotal;

    const roundTrip: ArbRoundTrip = {
      profit: profit.toString(),
      isProfitable: profit > 0,
    };

    return {
      forward,
      backward,
      roundTrip,
    };
  }
}
