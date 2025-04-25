import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import 'dotenv/config';
import { DexService } from './dex.service';

@Injectable()
export class SushiSwapService extends DexService {
  private readonly sushiLogger = new Logger(SushiSwapService.name);

  async quote(tokenIn: string, tokenOut: string, amountIn: string) {
    try {
      // Fetch decimals in parallel
      const [decIn, decOut] = await Promise.all([
        this.getTokenDecimals(tokenIn),
        this.getTokenDecimals(tokenOut),
      ]);
    } catch (error) {
      const message =
        error?.response?.data ?? error?.message ?? JSON.stringify(error);
      this.sushiLogger.error('Error getting quote:', message);
      throw new BadRequestException(`Error getting quote`);
    }
  }
}
