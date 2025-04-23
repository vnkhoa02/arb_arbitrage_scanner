import { Controller, Get, Param, Query } from '@nestjs/common';
import { TOKENS } from './config/token';
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
  async simpleArbitrage(@Query() query: any) {
    const amountIn = query?.amountIn || 1;
    return await this.dexService.simpleArbitrage(
      500,
      3000,
      10000,
      TOKENS.WETH,
      amountIn,
    );
  }
}
