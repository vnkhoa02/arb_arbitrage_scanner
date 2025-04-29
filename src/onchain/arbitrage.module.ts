import { Module } from '@nestjs/common';
import { ArbitrageService } from './arbitrage.service';
import { ArbitrageController } from './arbitrage.controller';
import { ScannerModule } from 'src/scanner/scanner.module';
import { MevService } from './mev.service';

@Module({
  imports: [ScannerModule],
  controllers: [ArbitrageController],
  providers: [ArbitrageService, MevService],
})
export class ArbitrageModule {}
