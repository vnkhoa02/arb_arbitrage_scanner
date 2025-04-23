import { Controller, Get, Param, Query } from '@nestjs/common';
import { FLASH_LOAN_FEE } from './config';
import { STABLE_COIN, TOKENS } from './config/token';
import { DexService } from './dex.service';

@Controller('dex')
export class DexController {
  constructor(private readonly dexService: DexService) {}

  @Get('token-info/:tokenAddress')
  async getTokenBasicInfo(@Param('tokenAddress') tokenAddress: string) {
    return this.dexService.getTokenBasicInfo(tokenAddress);
  }

  @Get('quotes')
  async getQuote(@Query() query: any) {
    return await this.dexService.getQuote(
      query.tokenIn,
      query.tokenOut,
      query.amountIn,
      query?.fee || 3000,
    );
  }

  @Get('arbitrage')
  async simpleArbitrage(@Query('amountIn') amountInRaw: string) {
    const amountIn = parseFloat(amountInRaw) || 1;

    // ─ Forward: WETH → USDT
    const forward = await this.dexService.simpleArbitrage(
      500,
      3000,
      10000,
      TOKENS.WETH,
      STABLE_COIN.USDT,
      amountIn,
    );

    // ─ Backward: USDT → WETH
    const backward = await this.dexService.simpleArbitrage(
      500,
      3000,
      10000,
      STABLE_COIN.USDT,
      TOKENS.WETH,
      forward.sellPrice, // the USDT you got
    );

    // ─ Round‐trip net WETH gain is simply backward.profit
    return {
      amountIn,
      forward,
      backward,
      roundTrip: {
        profit: backward.profit, // in WETH
        profitPct: backward.profitPct,
        isProfitable: backward.profit > 0,
      },
    };
  }
}
