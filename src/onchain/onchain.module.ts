import { Module } from '@nestjs/common';
import { OnchainService } from './onchain.service';
import { OnchainController } from './onchain.controller';
import { ScannerModule } from 'src/scanner/scanner.module';
import { MevService } from './mev.service';

@Module({
  imports: [ScannerModule],
  controllers: [OnchainController],
  providers: [OnchainService, MevService],
})
export class OnchainModule {}
