import { Global, Module } from '@nestjs/common';
import { DexService } from './dex.service';
import { DexController } from './dex.controller';

@Global()
@Module({
  controllers: [DexController],
  providers: [DexService],
  exports: [DexService],
})
export class DexModule {}
