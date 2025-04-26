import 'dotenv/config';
import { FlashbotsBundleProvider } from '@flashbots/ethers-provider-bundle';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { BigNumber, ethers, Wallet } from 'ethers';
import { provider } from 'src/dex/config/provider';
import { STABLE_COIN, TOKENS } from 'src/dex/config/token';
import { ScannerService } from 'src/scanner/scanner.service';
import arbitrageAbi from './abis/Arbitrage.abi.json';
import { ARBITRAGE_V1 } from './constants';
import { authSigner } from './config/flashbot';
import { ISimpleArbitrageParams, ISimpleArbitrageTrade } from './types';
import { pickBestRoute } from './utils';
import { getGasFee } from './utils/getGasFee';

const PRIVATE_KEY = process.env.PRIVATE_KEY;
@Injectable()
export class OnchainService implements OnModuleInit {
  private readonly logger = new Logger(OnchainService.name);
  private signer: Wallet;
  private flashbotsProvider: FlashbotsBundleProvider;
  private arbContract: ethers.Contract;

  constructor(private readonly scannerService: ScannerService) {
    this.signer = new Wallet(PRIVATE_KEY, provider);
  }

  async onModuleInit() {
    this.flashbotsProvider = await FlashbotsBundleProvider.create(
      provider,
      authSigner,
      'https://relay.flashbots.net',
    );
    this.arbContract = new ethers.Contract(
      ARBITRAGE_V1,
      arbitrageAbi.abi,
      this.signer,
    );
  }

  /**
   * Simulate and estimate gas & fee
   */
  private async simulateSimpleArbitrage(
    params: ISimpleArbitrageParams,
  ): Promise<{
    simulatedReturn: string;
  } | null> {
    try {
      const [simulatedReturn] = await Promise.all([
        this.arbContract.callStatic.simpleArbitrage(
          params.tokenIn,
          params.tokenOut,
          params.forwardPath,
          0,
          params.backwardPath,
          0,
          params.borrowAmount,
        ),
      ]);

      return { simulatedReturn };
    } catch (err) {
      this.logger.error('simulateSimpleArbitrage failed', err as any);
      return null;
    }
  }

  /**
   * Prepare params & run simulation
   */
  async simpleArbitrageTrade(params: ISimpleArbitrageTrade) {
    const path = await this.scannerService.arbitrage(
      params.tokenIn,
      params.tokenOut,
      params.amountIn,
    );
    const forward = pickBestRoute(path.forward.route);
    const backward = pickBestRoute(path.backward.route);
    const simParams: ISimpleArbitrageParams = {
      tokenIn: params.tokenIn,
      tokenOut: params.tokenOut,
      forwardPath: forward.encoded,
      forwardOutMin: BigInt(
        ethers.utils
          .parseUnits(path.forward.amountOut.toString(), 18)
          .toString(),
      ),
      backwardPath: backward.encoded,
      backwardOutMin: BigInt(
        ethers.utils
          .parseUnits(path.backward.amountOut.toString(), 18)
          .toString(),
      ),
      borrowAmount: BigInt(
        ethers.utils.parseUnits(params.amountIn.toString(), 18).toString(),
      ),
      profit: path.roundTrip.profit,
    };
    const simulation = await this.simulateSimpleArbitrage(simParams);
    return { simParams, simulation };
  }

  // @Cron(CronExpression.EVERY_5_SECONDS)
  private async scanTrade() {
    for (const tokenOut of [
      STABLE_COIN.USDT,
      STABLE_COIN.USDC,
      STABLE_COIN.DAI,
    ]) {
      const { simParams, simulation } = await this.simpleArbitrageTrade({
        tokenIn: TOKENS.WETH,
        tokenOut,
        amountIn: 1,
      });
      if (simulation) {
      }
    }
  }
}
