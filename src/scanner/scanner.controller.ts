import { Controller, Get } from '@nestjs/common';
import { ScannerService } from './scanner.service';

@Controller('scanner')
export class ScannerController {
  constructor(private readonly scannerService: ScannerService) {}

  @Get('check-arbitrage/:tokenAddress')
  async checkArbitrage(tokenAddress: string): Promise<{
    profitInUSDT: bigint;
    isProfitable: boolean;
  }> {
    return this.scannerService.checkArbitrage(tokenAddress);
  }
}
