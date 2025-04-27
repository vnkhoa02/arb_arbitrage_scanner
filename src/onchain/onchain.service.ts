import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import axios from 'axios';
import 'dotenv/config';
import { BigNumber, ethers, Wallet } from 'ethers';
import { provider } from 'src/dex/config/provider';
import { STABLE_COIN, TOKENS } from 'src/dex/config/token';
import { ScannerService } from 'src/scanner/scanner.service';
import arbitrageAbi from './abis/Arbitrage.abi.json';
import { REPLAY_URL } from './config/flashbot';
import { ARBITRAGE_V1 } from './constants';
import { ISimpleArbitrageParams, ISimpleArbitrageTrade } from './types';
import { pickBestRoute } from './utils';
import { getGasFee } from './utils/getGasFee';
import { sendNotify } from './utils/notify';

const PRIVATE_KEY = process.env.PRIVATE_KEY;
@Injectable()
export class OnchainService implements OnModuleInit {
  private readonly logger = new Logger(OnchainService.name);
  private signer: Wallet;
  private arbContract: ethers.Contract;

  constructor(private readonly scannerService: ScannerService) {
    this.signer = new Wallet(PRIVATE_KEY, provider);
  }

  async onModuleInit() {
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
    const gasEstimate = BigNumber.from(40000);
    const { maxFeePerGas, maxPriorityFeePerGas, estimatedFeeEth } =
      (await getGasFee(gasEstimate)) as {
        maxFeePerGas: BigNumber;
        maxPriorityFeePerGas: BigNumber;
        estimatedFeeEth: string;
      };

    if (Number(params.profit) <= Number(estimatedFeeEth)) {
      this.logger.warn(
        `Profit ${params.profit} ≤ fee ${estimatedFeeEth}, skipping`,
      );
      return;
    }

    // Build transaction request
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
      chainId: 1,
      type: 2,
      gasLimit: gasEstimate,
      maxFeePerGas,
      maxPriorityFeePerGas,
    };

    // Sign the transaction
    const signedTx = await this.signer.signTransaction(txRequest);
    const blockNum = await provider.getBlockNumber();
    const targetBlock = blockNum + 1;

    // Build Titan RPC call
    const payload = {
      jsonrpc: '2.0',
      id: 1,
      method: 'eth_sendBundle',
      params: [
        {
          txs: [signedTx],
          blockNumber: ethers.utils.hexValue(targetBlock),
          refundPercent: 90,
        },
      ],
    };

    this.logger.log(`Sending bundle to Titan for block ${targetBlock}`);
    try {
      const payloadStr = JSON.stringify(payload);
      const payloadHash = ethers.utils.keccak256(
        ethers.utils.toUtf8Bytes(payloadStr),
      );
      const signature = await this.signer.signMessage(
        ethers.utils.arrayify(payloadHash),
      );
      const publicAddress = await this.signer.getAddress();

      const response = await axios.post(REPLAY_URL, payload, {
        headers: {
          'Content-Type': 'application/json',
          'X-Flashbots-Signature': `${publicAddress}:${signature}`,
        },
      });

      if (response.data.error) {
        this.logger.error('Titan error', response.data.error);
      } else {
        const { bundleHash } = response.data.result;
        this.logger.log('Bundle submitted, hash:', bundleHash);
        sendNotify({ ...params, bundleHash });
        this.isSent = true;
      }
    } catch (err) {
      this.logger.error('Failed to send bundle to Titan', err as any);
    }
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
          amountIn: 1,
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
          if (Number(simParams.profit) <= 0) continue;
          this.isSent = true;
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
