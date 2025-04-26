import {
  FlashbotsBundleProvider,
  FlashbotsTransactionResolution,
} from '@flashbots/ethers-provider-bundle';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import 'dotenv/config';
import { BigNumber, ethers, Wallet } from 'ethers';
import { provider } from 'src/dex/config/provider';
import { STABLE_COIN, TOKENS } from 'src/dex/config/token';
import { ScannerService } from 'src/scanner/scanner.service';
import arbitrageAbi from './abis/Arbitrage.abi.json';
import { authSigner } from './config/flashbot';
import { ARBITRAGE_V1 } from './constants';
import { ISimpleArbitrageParams, ISimpleArbitrageTrade } from './types';
import { pickBestRoute } from './utils';
import { sendNotify } from './utils/notify';
import { Cron, CronExpression } from '@nestjs/schedule';
import { getGasFee } from './utils/getGasFee';
import { ChainId } from '@uniswap/sdk';

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

  private async submitArbitrage(params: ISimpleArbitrageParams) {
    const gasLimit = BigNumber.from(40000); // 40,000 units
    const { maxFeePerGas, maxPriorityFeePerGas } = await getGasFee();
    const txRequest: ethers.providers.TransactionRequest = {
      to: this.arbContract.address,
      data: this.arbContract.interface.encodeFunctionData('simpleArbitrage', [
        params.tokenIn,
        params.tokenOut,
        params.forwardPath,
        0,
        params.backwardPath,
        0,
        params.borrowAmount,
      ]),
      chainId: ChainId.MAINNET,
      type: 2,
      gasLimit,
      maxFeePerGas,
      maxPriorityFeePerGas,
    };

    console.log(new Date());
    console.log('Starting to run the private transaction...');

    const blockNum = await provider.getBlockNumber();
    const transaction = await this.flashbotsProvider.sendPrivateTransaction(
      {
        transaction: txRequest,
        signer: this.signer,
      },
      { maxBlockNumber: blockNum + 5 },
    );
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    const result = await transaction.wait();
    console.log('result ->>', result);
    if (result === FlashbotsTransactionResolution.TransactionIncluded) {
      console.log('Transaction included!');
    } else if (result === FlashbotsTransactionResolution.TransactionDropped) {
      console.warn('Transaction dropped.');
    } else {
      console.warn('Transaction not included.');
    }
    console.log(new Date());
    console.log('Private transaction submitted.');
  }

  private isSent = false;

  @Cron(CronExpression.EVERY_5_SECONDS)
  private async scanTrade() {
    if (this.isSent) {
      console.log('Trade already sent!', this.isSent);
      return;
    }
    const stableCoins = [STABLE_COIN.USDT, STABLE_COIN.USDC, STABLE_COIN.DAI];
    const promises = stableCoins.map(async (tokenOut) => {
      try {
        const { simParams, simulation } = await this.simpleArbitrageTrade({
          tokenIn: TOKENS.WETH,
          tokenOut,
          amountIn: 5,
        });

        if (simulation) {
          return { simParams, success: true };
        }
      } catch (error) {
        console.error(`Error during simulation for ${tokenOut}`, error);
      }
      return { success: false };
    });

    const results = await Promise.allSettled(promises);

    for (const result of results) {
      if (result.status === 'fulfilled' && result.value.success) {
        try {
          const { simParams } = result.value;
          this.isSent = true;
          sendNotify(simParams);
          await this.submitArbitrage(simParams);
          console.log('Successfully submitted arbitrage!');
          return; // Only send the first successful one
        } catch (error) {
          console.error('Error in submitArbitrage', error);
        }
      }
    }

    console.log('No successful arbitrage found.');
  }
}
