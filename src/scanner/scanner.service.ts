import { Injectable, Logger } from '@nestjs/common';
import { STABLE_COIN, TOKENS } from 'src/dex/config/token';
import { SushiSwapDexService } from 'src/dex/sushiswap.dex.service';
import { ArbPath, ArbPathResult, ArbRoundTrip } from 'src/dex/types';
import { DexService } from '../dex/dex.service';

@Injectable()
export class ScannerService {
  private readonly logger = new Logger(ScannerService.name);

  constructor(
    private readonly dexService: DexService,
    private readonly sushiSwapDexService: SushiSwapDexService,
  ) {}

  private async scanBackwards(forward: ArbPathResult): Promise<ArbPathResult> {
    // Now we have the tokenOut and amountOut, we need to find the tokenIn
    // that can be swapped to get the amountOut & has total value > forwadValue

    const forwadValue = Number(forward.amountIn) * Number(forward.value);
    const tokenIn = forward.tokenIn;
    const tokenOut = forward.tokenOut;
    const amountOut = forward.amountOut;

    // Get quotes for tokenOut on all available pairs. Now we get tokenOut/tokenTemp
    // Then get quotes for tokenTemp/tokenIn. Compare the total value with `forwadValue`
    const backward: ArbPathResult =
      await this.sushiSwapDexService.evaluateArbitrage(
        tokenOut,
        tokenIn,
        forward.amountOut,
      );
    return backward;
  }

  /** Perform both forward and backward legs and return full ArbPath */
  async arbitrage(
    tokenIn: string,
    tokenOut: string,
    amountIn: number,
  ): Promise<ArbPath> {
    // Forward leg
    const forward: ArbPathResult = await this.dexService.evaluateArbitrageV3(
      tokenIn,
      tokenOut,
      amountIn,
    );
    // Backward leg: swapping amountOut of tokenOut back to tokenIn
    const backward: ArbPathResult = await this.scanBackwards(forward);

    // Round-trip profit in original tokenIn
    const profit = Number(backward.value) - Number(forward.value);

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

  /** Perform both forward and backward legs and return full ArbPath */
  async simpleArbitrage(
    tokenIn: string,
    tokenOut: string,
    amountIn: number,
  ): Promise<ArbPath> {
    // Forward leg
    const promise1 = this.dexService.evaluateArbitrageV2(
      tokenIn,
      tokenOut,
      amountIn,
    );
    const promise2 = this.dexService.evaluateArbitrageV3(
      tokenIn,
      tokenOut,
      amountIn,
    );
    const [forwardV2Result, forwardResult] = await Promise.all([
      promise1,
      promise2,
    ]);
    // Compare the two forward results and take the one with the higher value
    let forward: ArbPathResult = forwardResult;
    if (forwardV2Result.value > forwardResult.value) {
      forward = forwardV2Result;
      this.logger.log('Using V2 forward result');
    }

    // Backward leg: swapping amountOut of tokenOut back to tokenIn
    const promise3 = await this.dexService.evaluateArbitrageV2(
      tokenOut,
      tokenIn,
      forward.amountOut,
    );

    const promise4 = await this.dexService.evaluateArbitrageV3(
      tokenOut,
      tokenIn,
      forward.amountOut,
    );

    const [backwardV2Result, backwardResult] = await Promise.all([
      promise3,
      promise4,
    ]);
    // Compare the two backward results and take the one with the higher value
    let backward: ArbPathResult = backwardResult;
    if (backwardV2Result.value > backwardResult.value) {
      backward = backwardV2Result;
      this.logger.log('Using V2 backward result');
    }
    // Round-trip profit in original tokenIn
    const profit = Number(backward.value) - Number(forward.value);

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

  // @Cron(CronExpression.EVERY_5_SECONDS)
  private async checkSimpleArbitrage() {
    this.logger.log('Checking for simple arbitrage...');
    const result = await this.simpleArbitrage(TOKENS.WETH, STABLE_COIN.USDT, 1);
    if (result.roundTrip.isProfitable) {
      this.logger.log('Arbitrage found:', result);
    }
    return result;
  }
}
