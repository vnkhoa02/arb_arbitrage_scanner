import { Controller, Get, Query, UseInterceptors } from '@nestjs/common';
import { BigIntSerializerInterceptor } from 'src/interceptor/BigIntSerializerInterceptor';
import { OnchainService } from './onchain.service';
import { TOKENS, STABLE_COIN } from 'src/dex/constants/tokens';

@Controller('onchain')
@UseInterceptors(BigIntSerializerInterceptor)
export class OnchainController {
  constructor(private readonly onchainService: OnchainService) {}

  @Get('arbitrage/simple')
  async simpleArbitrage(@Query() query: any) {
    const amountIn = query?.amountIn ?? 10;
    const tokenIn = query?.tokenIn ?? TOKENS.WETH;
    const tokenOut = query?.tokenOut ?? STABLE_COIN.USDT;

    return await this.onchainService.simulateSimpleArbitrage({
      tokenIn,
      tokenOut,
      amountIn,
    });
  }
}
