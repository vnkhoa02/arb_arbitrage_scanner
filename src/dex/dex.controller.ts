import { Controller, Get, Param, Query } from '@nestjs/common';
import { DexService } from './dex.service';

@Controller('dex')
export class DexController {
  constructor(private readonly dexService: DexService) {}

  @Get('token-info/:tokenAddress')
  async getTokenBasicInfo(@Param('tokenAddress') tokenAddress: string) {
    return this.dexService.getTokenBasicInfo(tokenAddress);
  }

  @Get('output-amount')
  async getOutputAmount(@Query() query: any) {
    const { routerAddr, amountIn, path } = query;
    return this.dexService.getOutputAmount(routerAddr, amountIn, path);
  }
}
