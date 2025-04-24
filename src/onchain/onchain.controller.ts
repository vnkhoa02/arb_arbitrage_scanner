import { Controller, Get } from '@nestjs/common';
import { OnchainService } from './onchain.service';

@Controller('onchain')
export class OnchainController {
  constructor(private readonly onchainService: OnchainService) {}

  @Get('owner')
  async getOwner(): Promise<string> {
    return this.onchainService.getOwner();
  }

  @Get('swap-router')
  async getSwapRouter(): Promise<string> {
    return this.onchainService.getSwapRouterAddress();
  }
}
