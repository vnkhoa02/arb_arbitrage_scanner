import { Global, Module } from '@nestjs/common';
import { DexService } from './dex.service';
import { DexController } from './dex.controller';
import { BestRouteFinder } from './bestRouteFinder';

@Global()
@Module({
  controllers: [DexController],
  providers: [DexService, BestRouteFinder],
  exports: [DexService, BestRouteFinder],
})
export class DexModule {}
