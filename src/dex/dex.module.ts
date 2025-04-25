import { Global, Module } from '@nestjs/common';
import { BestRouteFinder } from './bestRouteFinder';
import { DexController } from './dex.controller';
import { DexService } from './dex.service';
import { SushiSwapService } from './sushiswap.dex.service';

@Global()
@Module({
  controllers: [DexController],
  providers: [DexService, SushiSwapService, BestRouteFinder],
  exports: [DexService, SushiSwapService],
})
export class DexModule {}
