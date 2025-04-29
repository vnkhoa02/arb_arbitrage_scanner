import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DexModule } from './dex/dex.module';
import { ScannerModule } from './scanner/scanner.module';
import { ScheduleModule } from '@nestjs/schedule';
import { ArbitrageModule } from './onchain/arbitrage.module';

@Module({
  imports: [ScheduleModule.forRoot(), DexModule, ScannerModule, ArbitrageModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
