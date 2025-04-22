import { Module } from '@nestjs/common';
import { DexService } from './dex.service';
import { DexController } from './dex.controller';

@Module({
  controllers: [DexController],
  providers: [DexService],
})
export class DexModule {}
