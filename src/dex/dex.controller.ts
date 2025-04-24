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
    const version = query?.version;
    if (version === 'v2') {
      return await this.dexService.getQuoteV2(
        query.tokenIn,
        query.tokenOut,
        query.amountIn,
      );
    }
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

  @Get('/pools')
  async getPools() {
    return await this.sushiSwapDexService.findPoolsToken(
      STABLE_COIN.USDT,
      TOKENS.WETH,
    );
  }
}
