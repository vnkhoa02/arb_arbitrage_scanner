import { Controller, Get, Param, Query } from '@nestjs/common';
import { DexService } from './dex.service';
import { STABLE_COIN, TOKENS } from './config/token';

@Controller('dex')
export class DexController {
  constructor(private readonly dexService: DexService) {}

  @Get('token-info/:tokenAddress')
  async getTokenBasicInfo(@Param('tokenAddress') tokenAddress: string) {
    return this.dexService.getTokenBasicInfo(tokenAddress);
  }

  @Get('quotes')
  async getQuote(@Query() query: any) {
    const results = await Promise.all(
      Object.entries(STABLE_COIN).map(async ([symbol, address]) => {
        try {
          const decimals = ['USDC', 'USDT'].includes(symbol) ? 6 : 18;
          const value = await this.dexService.getQuote(
            TOKENS.WETH,
            address,
            query.amountIn,
            decimals,
          );
          return { symbol: `weth${symbol.toLowerCase()}`, value };
        } catch (error) {
          return {
            symbol: `weth??${symbol.toLowerCase()}`,
            error: error.message || 'Unknown error',
          };
        }
      }),
    );

    return results.reduce((acc, { symbol, value, error }) => {
      acc[symbol] = error ? { error } : value;
      return acc;
    }, {});
  }
}
