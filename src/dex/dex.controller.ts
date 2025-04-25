import { Controller, Get, Param, Query, UseInterceptors } from '@nestjs/common';
import { DexService } from './dex.service';
import { BestRouteFinder } from './bestRouteFinder';
import { ethers } from 'ethers';
import { BigIntSerializerInterceptor } from 'src/interceptor/BigIntSerializerInterceptor';

@Controller('dex')
@UseInterceptors(BigIntSerializerInterceptor)
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

  @Get('route')
  async getBestRoute(@Query() query: any) {
    const tokenIn = query?.tokenIn;
    const tokenOut = query?.tokenOut;
    const amountIn = query?.amountIn;

    const [decIn, decOut] = await Promise.all([
      this.dexService.getTokenDecimals(tokenIn),
      this.dexService.getTokenDecimals(tokenOut),
    ]);
    return await this.bestRouteFinder.findBestRoute(
      tokenIn,
      decIn,
      tokenOut,
      decOut,
      ethers.utils.parseUnits(amountIn, decIn).toBigInt(),
    );
  }
}
