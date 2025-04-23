import { Global, Module } from '@nestjs/common';
import { DexService } from './dex.service';
import { DexController } from './dex.controller';
import { SushiSwapDexService } from './sushiswap.dex.service';

@Global()
@Module({
  controllers: [DexController],
  providers: [DexService, SushiSwapDexService],
  exports: [DexService, SushiSwapDexService],
})
export class DexModule {}
