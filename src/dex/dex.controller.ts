import { Controller, Get, Param, Query, UseInterceptors } from '@nestjs/common';
import { BigIntSerializerInterceptor } from 'src/interceptor/BigIntSerializerInterceptor';
import { DexService } from './dex.service';
import { SushiSwapService } from './sushiswap.dex.service';

@Controller('dex')
@UseInterceptors(BigIntSerializerInterceptor)
export class DexController {
  constructor(
    private readonly dexService: DexService,
    private readonly sushiSwapDex: SushiSwapService,
  ) {}

  @Get('token-info/:tokenAddress')
  async getTokenBasicInfo(@Param('tokenAddress') tokenAddress: string) {
    return this.dexService.getTokenBasicInfo(tokenAddress);
  }

  @Get('quote/sushi')
  async getSushiQuote(@Query() query: any) {
    return await this.sushiSwapDex.sushiQuote(
      query.tokenIn,
      query.tokenOut,
      query.amountIn,
    );
  }

  @Get('quote')
  async getQuote(@Query() query: any) {
    return await this.dexService.getQuoteV2(
      query.tokenIn,
      query.tokenOut,
      query.amountIn,
    );
  }

  @Get('quote/v1')
  async getBestRoute(@Query() query: any) {
    return await this.dexService.getQuote(
      query.tokenIn,
      query.tokenOut,
      query.amountIn,
    );
  }
}
