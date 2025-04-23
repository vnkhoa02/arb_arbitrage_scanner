import { TOKENS } from './config/token';
import { Controller, Get, Param, Query } from '@nestjs/common';
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
  async simpleArbitrage() {
    return await this.dexService.simpleArbitrage(
      500,
      3000,
      10000,
      TOKENS.WETH,
      1,
    );
  }
}
