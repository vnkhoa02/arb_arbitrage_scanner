import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DexModule } from './dex/dex.module';
import { ScannerModule } from './scanner/scanner.module';
import { ScheduleModule } from '@nestjs/schedule';

@Module({
  imports: [ScheduleModule.forRoot(), DexModule, ScannerModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
