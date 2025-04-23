import { FLASH_LOAN_FEE } from './config';
import { BadRequestException, Injectable } from '@nestjs/common';
import { ethers, toBigInt } from 'ethers';
import { provider } from './config/provider';
import { DEX, STABLE_COIN } from './config/token';
import { ArbPathResult } from './types';
import { defaultArbPathResult } from './constants';

@Injectable()
export class DexService {
  /**
   * Get basic information about a token using its address.
   * @param tokenAddress The address of the token contract.
   * @returns An object containing the token's name, symbol, decimals, and total supply.
   */
  async getTokenBasicInfo(tokenAddress: string) {
    try {
      const ERC20_ABI = [
        'function name() view returns (string)',
        'function symbol() view returns (string)',
        'function decimals() view returns (uint8)',
        'function totalSupply() view returns (uint256)',
      ];
      if (!ethers.isAddress(tokenAddress))
        throw new BadRequestException('Invalid token address');
      const contract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);

      const [name, symbol, decimals, totalSupply] = await Promise.all([
        contract.name(),
        contract.symbol(),
        contract.decimals(),
        contract.totalSupply(),
      ]);

      return {
        name,
        symbol,
        decimals: toBigInt(decimals).toString(),
        totalSupply: ethers.formatUnits(totalSupply, decimals),
      };
    } catch (error) {
      console.error('Error getting token info:', error);
      throw new BadRequestException(
        `Error getting token info: ${error.message}`,
      );
    }
  }

  /**
   * Get the number of decimals for a given token address.
   * @param tokenAddress The address of the token contract.
   * @returns The number of decimals for the token.
   */

  async getTokenDecimals(tokenAddress: string) {
    const tokenInfo = await this.getTokenBasicInfo(tokenAddress);
    return tokenInfo.decimals;
  }

  /**
   * Get the output amount for a given input amount and path using the Uniswap router.
   * @param amountIn The input amount.
   *  @param path The path of token addresses for the swap.
   */
  async getOutputAmount(amountIn: string, path: string[]) {
    const routerABI = [
      'function getAmountsOut(uint amountIn, address[] memory path) view returns (uint[] memory amounts)',
    ];
    const router = new ethers.Contract(DEX.uniswap.router, routerABI, provider);
    const amountsOut = await router.getAmountsOut(amountIn, path);
    return amountsOut[1];
  }

  /**
   * Get a quote for a token swap using the Uniswap Quoter contract.
   * @param tokenIn The address of the input token.
   * @param tokenOut The address of the output token.
   * @param amountIn The amount of the input token.
   * @param fee The fee tier of the Uniswap pool (e.g., 500, 3000, 10000).
   * @param decimalOut The number of decimals for the output token (default is 6).
   * @returns The quoted amount of the output token.
   */
  async getQuote(
    tokenIn: string,
    tokenOut: string,
    amountIn: string,
    feeAmount: string | number,
  ) {
    const quoterABI = [
      'function quoteExactInputSingle(address,address,uint24,uint256,uint160) view returns (uint256)',
    ];
    const quoter = new ethers.Contract(DEX.uniswap.quoter, quoterABI, provider);
    try {
      const decIn = tokenIn === STABLE_COIN.USDT ? 6 : 18;
      const decOut = tokenOut === STABLE_COIN.USDT ? 6 : 18;
      const sqrtPriceLimitX96 = 0;
      const amountInUnits = ethers.parseUnits(amountIn, decIn);

      const quotedAmount = await quoter.quoteExactInputSingle(
        tokenIn,
        tokenOut,
        toBigInt(feeAmount),
        amountInUnits,
        sqrtPriceLimitX96,
      );
      return ethers.formatUnits(quotedAmount, decOut);
    } catch (error) {
      console.error('Error getting quote:', error);
      throw new BadRequestException(`Error getting quote: ${error.message}`);
    }
  }
  private async evaluateArbitrage(
    _lowFee: number,
    _midFee: number,
    _highFee: number,
    tokenIn: string,
    amountIn: number,
    tokenOut: string,
  ): Promise<ArbPathResult> {
    // 1) Fetch all three quotes in parallel
    const feePools = [
      { label: 'Low', fee: _lowFee, price: 0 },
      { label: 'Mid', fee: _midFee, price: 0 },
      { label: 'High', fee: _highFee, price: 0 },
    ];
    const quotes = await Promise.all(
      feePools.map((p) =>
        this.getQuote(tokenIn, tokenOut, String(amountIn), p.fee),
      ),
    );
    quotes.forEach((q, i) => (feePools[i].price = parseFloat(q)));
    const validPools = feePools.filter((p) => !Number.isNaN(p.price));
    if (validPools.length < 2) return defaultArbPathResult;

    // 2) Identify best buy (min price) & best sell (max price)
    const buyPool = validPools.reduce((a, b) => (a.price < b.price ? a : b));
    const sellPool = validPools.reduce((a, b) => (a.price > b.price ? a : b));

    // 3) Quick check—if no upside, abort early
    if (sellPool.price <= buyPool.price) return defaultArbPathResult;

    // 4) Compute fees & profit
    const swapFees = (buyPool.fee + sellPool.fee) / 1_000_000; // e.g. (3000+10000)/1000000 = 0.013
    const totalFeePct = swapFees + FLASH_LOAN_FEE;
    const gross = (sellPool.price - buyPool.price) * amountIn; // how much USDT you’d make before fees
    const feeCost = totalFeePct * buyPool.price * amountIn; // USDT you pay in fees
    const profit = gross - feeCost;
    const profitPct = (profit / (buyPool.price * amountIn)) * 100;

    return {
      profit,
      profitPct,
      buyLabel: buyPool.label,
      sellLabel: sellPool.label,
      buyFee: buyPool.fee,
      sellFee: sellPool.fee,
      buyPrice: buyPool.price,
      sellPrice: sellPool.price,
      totalFeePct,
    };
  }

  private logArbitrage(
    tokenIn: string,
    amountIn: number,
    pools: { label: string; fee: number; price: number }[],
    result: ArbPathResult,
  ) {
    console.log(`\n🧾 Arbitrage Check (${amountIn} Amount) of ${tokenIn}:`);
    for (const p of pools) {
      console.log(
        `  • ${p.label}-Fee Pool (${(p.fee / 10000).toFixed(
          4,
        )}%): ${p.price.toFixed(6)} USDT`,
      );
    }
    if (result.profit > 0) {
      console.log(`\n✅ Best Path: ${result.buyLabel} → ${result.sellLabel}`);
      console.log(`   Buy Price:  ${result.buyPrice.toFixed(6)} USDT`);
      console.log(`   Sell Price: ${result.sellPrice.toFixed(6)} USDT`);
      console.log(`   Total Fees: ${(result.totalFeePct * 100).toFixed(4)}%`);
      console.log(
        `   Profit: ${result.profit.toFixed(
          6,
        )} USDT (${result.profitPct.toFixed(4)}%)`,
      );
    } else {
      console.log(
        '\n❌ No arbitrage opportunity (all pairs unprofitable after fees).',
      );
    }
  }

  async simpleArbitrage(
    lowFee: number,
    midFee: number,
    highFee: number,
    tokenIn: string,
    tokenOut: string,
    amountIn: number,
  ) {
    // 1) Evaluate
    const result = await this.evaluateArbitrage(
      lowFee,
      midFee,
      highFee,
      tokenIn,
      amountIn,
      tokenOut,
    );

    // Here I’ll just reconstruct:
    const originalPools = [
      {
        label: 'Low',
        fee: lowFee,
        price:
          result.buyLabel === 'Low'
            ? result.buyPrice
            : result.sellLabel === 'Low'
            ? result.sellPrice
            : NaN,
      },
      {
        label: 'Mid',
        fee: midFee,
        price:
          result.buyLabel === 'Mid'
            ? result.buyPrice
            : result.sellLabel === 'Mid'
            ? result.sellPrice
            : NaN,
      },
      {
        label: 'High',
        fee: highFee,
        price:
          result.buyLabel === 'High'
            ? result.buyPrice
            : result.sellLabel === 'High'
            ? result.sellPrice
            : NaN,
      },
    ];
    this.logArbitrage(tokenIn, amountIn, originalPools, result);

    return result;
  }
}
