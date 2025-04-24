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
    const backward: ArbPathResult = await this.dexService.evaluateArbitrageV3(
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
      this.dexService.evaluateArbitrageV3(tokenIn, tokenOut, amountIn),
      this.dexService
        .evaluateArbitrageV3(tokenIn, tokenOut, amountIn)
        .then((f) => this.scanBackwards(f)),
    ]);

    const profit = Number(backward.value) - Number(forward.value);

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

  // @Cron(CronExpression.EVERY_5_SECONDS)
  private async checkSimpleArbitrage() {
    this.logger.log('Checking for simple arbitrage...');
    const result = await this.arbitrage(TOKENS.WETH, STABLE_COIN.USDT, 1);
    if (result.roundTrip.isProfitable) {
      this.logger.log('Arbitrage found:', result);
    }
    return result;
  }
}
