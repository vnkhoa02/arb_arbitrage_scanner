import { Injectable } from '@nestjs/common';
import { ethers } from 'ethers';
import { DEX, STABLE_COIN, TOKENS } from 'src/dex/config/token';
import { DexService } from '../dex/dex.service';

@Injectable()
export class ScannerService {
  constructor(private readonly dexService: DexService) {}

  /**
   * The flow must be in 1 transaction:
   * 1. Check 1 WBTC -> ? USDT (ex. 100,200 USDT)
   * 2. Check 1 WBTC -> ? DAI (ex. 100,000 DAI)
   * 3. Then take a Flashloan of 1 WBTC (with 0.09% fee = 0.0009 WBTC => total 1.0009 WBTC)
   * 4. Swap WBTC -> USDT (Now you have 100,200 USDT)
   * 5. Swap 100.000 USDT -> DAI (Now you have 100,000 DAI & 200 USDT left)
   * 6. Swap DAI -> WBTC
   * 6.1 Flashloan fee is 0.0009 WBTC => 0.0009 * 100,000 DAI = 90 DAI
   * 7. Repay Flashloan
   * 8. Profit = 200 USDT - 90 DAI ~= 110 USDT
   * This example not only for WBTC, but also apply for other tokens
   */
  async simulateArbitrage(tokenAddress: string): Promise<{
    profitInUSDT: bigint;
    isProfitable: boolean;
  }> {
    const DECIMALS = await this.dexService.getTokenDecimals(tokenAddress);
    const amountIn = ethers.parseUnits('1', DECIMALS); // Flashloan 1 token

    // 1. Token → USDT
    const toUSDTPath = [tokenAddress, STABLE_COIN.USDT];
    const usdtOut = await this.dexService.getOutputAmount(
      amountIn.toString(),
      toUSDTPath,
    );
    if (!usdtOut) return { profitInUSDT: 0n, isProfitable: false };

    // 2. USDT → DAI (only swap 100k USDT)
    const amountUsdtToDai = ethers.parseUnits('100000', 6);
    const usdtToDaiPath = [STABLE_COIN.USDT, STABLE_COIN.DAI];
    const daiOut = await this.dexService.getOutputAmount(
      amountUsdtToDai.toString(),
      usdtToDaiPath,
    );
    if (!daiOut) return { profitInUSDT: 0n, isProfitable: false };

    // 3. DAI → Token
    const daiToTokenPath = [STABLE_COIN.DAI, tokenAddress];
    const tokenOut = await this.dexService.getOutputAmount(
      daiOut.toString(),
      daiToTokenPath,
    );
    if (!tokenOut) return { profitInUSDT: 0n, isProfitable: false };

    // 4. Calculate Flashloan fee (0.09%)
    const flashloanFee = (amountIn * 9n) / 10000n;
    const totalToRepay = amountIn + flashloanFee;

    if (tokenOut > totalToRepay) {
      const profitToken = tokenOut - totalToRepay;

      const profitInUSDT = await this.dexService.getOutputAmount(
        profitToken.toString(),
        [tokenAddress, STABLE_COIN.USDT],
      );

      return { profitInUSDT: profitInUSDT ?? 0n, isProfitable: true };
    }

    return { profitInUSDT: 0n, isProfitable: false };
  }

  async checkArbitrage(tokenAddress: string) {
    const { profitInUSDT, isProfitable } = await this.simulateArbitrage(
      tokenAddress,
    );

    if (isProfitable) {
      console.log(
        `🚨 Arbitrage Opportunity! Profit: ${ethers.formatUnits(
          profitInUSDT.toString(),
          6,
        )} USDT (Est.) on token: ${tokenAddress}`,
      );
    } else {
      console.log(`No arbitrage opportunity for ${tokenAddress}`);
    }

    return {
      profitInUSDT,
      isProfitable,
    };
  }
}
