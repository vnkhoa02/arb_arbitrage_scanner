import 'dotenv/config';
import { Injectable, OnModuleInit } from '@nestjs/common';
import { ethers } from 'ethers';
import { provider } from 'src/dex/config/provider';
import * as abi from './abis/Arbitrage.abi.json';
import { ARBITRAGE_V1 } from './constants';
import { ArbitrageAbi } from 'types/ethers-contracts';

const walletPrivateKey = process.env.TESTER_PROD_PRIVATE_KEY;

@Injectable()
export class OnchainService implements OnModuleInit {
  private contract: ArbitrageAbi;

  onModuleInit() {
    this.contract = new ethers.Contract(
      ARBITRAGE_V1,
      abi.abi,
      provider,
    ) as unknown as ArbitrageAbi;
  }

  async getOwner(): Promise<string> {
    return this.contract.owner();
  }

  async getSwapRouterAddress(): Promise<string> {
    return this.contract.swapRouter();
  }

  async simulateSimpleArbitrage(params: {
    tokenIn: string;
    tokenOut: string;
    forwardPath: string;
    forwardOutMin: bigint;
    backwardPath: string;
    backwardOutMin: bigint;
    borrowAmount: bigint;
  }): Promise<boolean> {
    try {
      // NOTE: .callStatic requires a signer, even for simulations
      const signer = new ethers.Wallet(walletPrivateKey, provider);
      const contractWithSigner = this.contract.connect(signer);

      const tx = await contractWithSigner.simpleArbitrage(
        params.tokenIn,
        params.tokenOut,
        params.forwardPath,
        params.forwardOutMin,
        params.backwardPath,
        params.backwardOutMin,
        params.borrowAmount,
      );

      console.log('tx -->', tx);
      return true; // Simulated call succeeded
    } catch (error) {
      console.error('Simulation failed:', error);
      return false;
    }
  }
}
