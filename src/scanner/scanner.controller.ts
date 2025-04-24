import { Controller, Get, Query } from '@nestjs/common';
import { ScannerService } from './scanner.service';
import { TOKENS, STABLE_COIN } from 'src/dex/config/token';

@Controller('scanner')
export class ScannerController {
  constructor(private readonly scannerService: ScannerService) {}

  @Get('arbitrage')
  async arbitrage(@Query() query: any) {
    const amountIn = query?.amountIn ?? 10;
    const tokenIn = query?.tokenIn ?? TOKENS.WETH;
    const tokenOut = query?.tokenOut ?? STABLE_COIN.USDT;

    return await this.scannerService.arbitrage(tokenIn, tokenOut, amountIn);
  }
}
