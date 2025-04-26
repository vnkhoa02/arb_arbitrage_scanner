import { Controller, Get, Query } from '@nestjs/common';
import { STABLE_COIN, TOKENS } from 'src/dex/config/token';
import { OnchainService } from './onchain.service';

@Controller('onchain')
export class OnchainController {
  constructor(private readonly onchainService: OnchainService) {}

  @Get('owner')
  async getOwner(): Promise<string> {
    return this.onchainService.getOwner();
  }

  @Get('swap-router')
  async getSwapRouter(): Promise<string> {
    return this.onchainService.getSwapRouterAddress();
  }

  @Get('arbitrage/simple')
  async simpleArbitrage(@Query() query: any) {
    const amountIn = query?.amountIn ?? 10;
    const tokenIn = query?.tokenIn ?? TOKENS.WETH;
    const tokenOut = query?.tokenOut ?? STABLE_COIN.USDT;

    return await this.onchainService.simpleArbitrageTrade({
      tokenIn,
      tokenOut,
      amountIn,
    });
  }
}
