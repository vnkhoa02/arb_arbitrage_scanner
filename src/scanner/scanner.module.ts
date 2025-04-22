import { Module } from '@nestjs/common';
import { ScannerService } from './scanner.service';
import { ScannerController } from './scanner.controller';

@Module({
  controllers: [ScannerController],
  providers: [ScannerService],
})
export class ScannerModule {}
