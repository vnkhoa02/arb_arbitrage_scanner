import { Controller, Get, Param, Query } from '@nestjs/common';
import { DexService } from './dex.service';
import { SushiSwapDexService } from './sushiswap.dex.service';

@Controller('dex')
export class DexController {
  constructor(
    private readonly dexService: DexService,
    private readonly sushiSwapDexService: SushiSwapDexService,
  ) {}

  @Get('token-info/:tokenAddress')
  async getTokenBasicInfo(@Param('tokenAddress') tokenAddress: string) {
    return this.dexService.getTokenBasicInfo(tokenAddress);
  }

  @Get('quotes')
  async getQuote(@Query() query: any) {
    return await this.dexService.getQuoteV2(
      query.tokenIn,
      query.tokenOut,
      query.amountIn,
    );
  }

  @Get('quotes/sushiswap')
  async getSushiSwapQuote(@Query() query: any) {
    return await this.sushiSwapDexService.getQuote(
      query.tokenIn,
      query.tokenOut,
      query.amountIn,
    );
  }
}
