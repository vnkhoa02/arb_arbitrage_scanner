import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import axios from 'axios';
import 'dotenv/config';
import { ethers, Wallet } from 'ethers';
import { provider } from 'src/dex/config/provider';
import { STABLE_COIN, TOKENS } from 'src/dex/config/token';
import { ScannerService } from 'src/scanner/scanner.service';
import arbitrageAbi from './abis/Arbitrage.abi.json';
import { BEAVER_BUILD_RPC, TITAN_RPC } from './config/flashbot';
import { ARBITRAGE_V1, PUBLIC_ADDRESS } from './constants';
import { ISimpleArbitrageParams, ISimpleArbitrageTrade } from './types';
import { pickBestRoute } from './utils';
import { sendNotify } from './utils/notify';

const PRIVATE_KEY = process.env.PRIVATE_KEY;
@Injectable()
export class OnchainService implements OnModuleInit {
  private readonly logger = new Logger(OnchainService.name);
  private signer: Wallet;
  private arbContract: ethers.Contract;
  private totalTrade = 0;

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

  async simulateSimpleArbitrage(trade: ISimpleArbitrageTrade): Promise<{
    simulatedReturn: string;
  }> {
    try {
      const params = await this.getArbitrageTradeParams(trade);
      const simulatedReturn = await this.arbContract.callStatic.simpleArbitrage(
        params.tokenIn,
        params.tokenOut,
        params.forwardPath,
        0,
        params.backwardPath,
        0,
        params.borrowAmount,
      );
      return simulatedReturn;
    } catch (err) {
      this.logger.error('simulateSimpleArbitrage failed', err as any);
      return null;
    }
  }

  /**
   * Prepare ISimpleArbitrageParams params
   * @returns ISimpleArbitrageParams
   */
  async getArbitrageTradeParams(
    trade: ISimpleArbitrageTrade,
  ): Promise<ISimpleArbitrageParams> {
    const path = await this.scannerService.arbitrage(
      trade.tokenIn,
      trade.tokenOut,
      trade.amountIn,
    );
    const forward = pickBestRoute(path.forward.route);
    const backward = pickBestRoute(path.backward.route);
    const simParams: ISimpleArbitrageParams = {
      tokenIn: trade.tokenIn,
      tokenOut: trade.tokenOut,
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
        ethers.utils.parseUnits(trade.amountIn.toString(), 18).toString(),
      ),
      profit: path.roundTrip.profit,
    };
    return simParams;
  }

  private async submitArbitrage(params: ISimpleArbitrageParams) {
    try {
      // 1. Prepare transaction
      const txRequest =
        await this.arbContract.populateTransaction.simpleArbitrage(
          params.tokenIn,
          params.tokenOut,
          params.forwardPath,
          0,
          params.backwardPath,
          0,
          params.borrowAmount,
        );

      txRequest.chainId = 1;
      txRequest.type = 2;

      // 2. Estimate gas with 20% buffer
      // let gasEstimate = BigNumber.from(40000);
      let gasEstimate = await provider.estimateGas(txRequest);
      this.logger.debug(`Gas estimate: ${gasEstimate.toString()}`);
      gasEstimate = gasEstimate.mul(120).div(100);
      this.logger.debug(`Gas estimate (buffered): ${gasEstimate.toString()}`);

      // const { maxFeePerGas, maxPriorityFeePerGas, estimatedFeeEth } =
      //   (await getGasFee(gasEstimate)) as {
      //     maxFeePerGas: BigNumber;
      //     maxPriorityFeePerGas: BigNumber;
      //     estimatedFeeEth: string;
      //   };

      txRequest.gasLimit = gasEstimate;
      // txRequest.maxFeePerGas = maxFeePerGas;
      // txRequest.maxPriorityFeePerGas = maxPriorityFeePerGas;

      // 3. Sign transaction and prepare bundle
      const [signedTx, latestBlock] = await Promise.all([
        this.signer.signTransaction(txRequest),
        provider.getBlockNumber(),
      ]);

      const targetBlock = latestBlock + 1;
      this.logger.log(`Prepared bundle for block ${targetBlock}`);

      const payload = {
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_sendBundle',
        params: [
          {
            txs: [signedTx],
            blockNumber: ethers.utils.hexValue(targetBlock),
            // refundPercent: 90,
          },
        ],
      };
      this.logger.debug('payload ->', payload);

      // 4. Sign payload
      const payloadStr = JSON.stringify(payload);
      const payloadHash = ethers.utils.keccak256(
        ethers.utils.toUtf8Bytes(payloadStr),
      );
      const signature = await this.signer.signMessage(
        ethers.utils.arrayify(payloadHash),
      );
      // 5. Send bundle
      this.logger.log(`Sending bundle to RPC for block ${targetBlock}...`);

      const response = await axios.post(TITAN_RPC, payload, {
        headers: {
          'Content-Type': 'application/json',
          'X-Flashbots-Signature': `${PUBLIC_ADDRESS}:${signature}`,
        },
      });

      if (response.data.error) {
        this.logger.error('RPC Error', response.data.error);
        return;
      }

      const { bundleHash } = response.data.result;
      this.logger.log('Bundle submitted successfully, hash:', bundleHash);
      return bundleHash;
    } catch (error) {
      this.logger.error('Error during submitArbitrage', error);
    }
  }

  private async handleSimulation(tokenOut: string) {
    try {
      const simParams = await this.getArbitrageTradeParams({
        tokenIn: TOKENS.WETH,
        tokenOut,
        amountIn: 1,
      });

      const minProfit = 0.00035; // ~0.64$ today
      if (Number(simParams.profit) <= minProfit) return;
      this.logger.log(
        `Profitable arbitrage via ${tokenOut}: Profit ${simParams.profit}`,
      );
      const bundleHash = await this.submitArbitrage(simParams);
      if (bundleHash) {
        this.totalTrade++;
        sendNotify({ ...simParams, bundleHash });
        this.logger.log('Arbitrage submitted successfully!');
      }
    } catch (error) {
      console.error(`Simulation error for ${tokenOut}`, error);
    }
  }

  @Cron('*/3 * * * * *') // every 3 seconds
  private scanTrade() {
    if (this.totalTrade > 3) {
      this.logger.warn('Max trade reached', this.totalTrade);
      return;
    }
    const stableCoins = [STABLE_COIN.USDT, STABLE_COIN.USDC];
    for (const tokenOut of stableCoins) {
      this.handleSimulation(tokenOut);
    }
  }
}
