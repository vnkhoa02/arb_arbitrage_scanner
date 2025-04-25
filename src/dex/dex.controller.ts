import { Controller, Get, Param, Query } from '@nestjs/common';
import { DexService } from './dex.service';
import { BestRouteFinder } from './bestRouteFinder';

@Controller('dex')
export class DexController {
  constructor(
    private readonly dexService: DexService,
    private readonly bestRouteFinder: BestRouteFinder,
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

  // @Get('route')
  // async getBestRoute(@Query() query: any) {
  //   const tokenIn = query?.tokenIn;
  //   const tokenOut = query?.tokenOut;
  //   const amountIn = query?.amountIn;

  //   const decIn = await this.dexService.getTokenDecimals(tokenIn);
  //   const decOut = await this.dexService.getTokenDecimals(tokenIn);
  //   return await this.bestRouteFinder.findBestRoute(
  //     tokenIn,
  //     decIn,
  //     tokenOut,
  //     decOut,
  //     parseUnits(amountIn, decIn),
  //   );
  // }
}
