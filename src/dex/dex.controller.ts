import { Controller, Get, Param, Query } from '@nestjs/common';
import { DexService } from './dex.service';

@Controller('dex')
export class DexController {
  constructor(private readonly dexService: DexService) {}

  @Get('token-info/:tokenAddress')
  async getTokenBasicInfo(@Param('tokenAddress') tokenAddress: string) {
    return this.dexService.getTokenBasicInfo(tokenAddress);
  }

  @Get('quote')
  async getQuote(@Query() query: any) {
    return this.dexService.getQuote(
      query.tokenIn,
      query.tokenOut,
      query.amountIn,
    );
  }
}
