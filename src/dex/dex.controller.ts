import { Controller, Get, Param, Query } from '@nestjs/common';
import { STABLE_COIN, TOKENS } from './config/token';
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
    return await this.dexService.getQuote(
      query.tokenIn,
      query.tokenOut,
      query.amountIn,
      query?.fee || 3000,
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

  @Get('pairs')
  async getPairsByToken(@Query('tokenIn') tokenIn: string) {
    return await this.dexService.getPairsByToken(tokenIn);
  }
}
