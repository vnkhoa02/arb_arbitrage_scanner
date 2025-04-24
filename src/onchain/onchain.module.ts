import { Module } from '@nestjs/common';
import { OnchainService } from './onchain.service';
import { OnchainController } from './onchain.controller';

@Module({
  controllers: [OnchainController],
  providers: [OnchainService],
})
export class OnchainModule {}
