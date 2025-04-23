import { BadRequestException, Injectable } from '@nestjs/common';
import { FeeAmount } from '@uniswap/v3-sdk';
import { ethers } from 'ethers';
import chunk from 'lodash/chunk';
import { provider } from './config/provider';
import { DEX, STABLE_COIN } from './config/token';
import { tokens } from './constants/tokens';
import { ArbPathResult } from './types';

@Injectable()
export class DexService {
  /**
   * Get the current gas price in Gwei.
   * @returns The current gas price in Gwei.
   */
  async getGasPrice() {
    const feeData = await provider.getFeeData();
    return ethers.formatUnits(feeData.gasPrice, 'gwei');
  }

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
        decimals: BigInt(decimals).toString(),
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
  ): Promise<string> {
    const quoterABI = [
      'function quoteExactInputSingle(address,address,uint24,uint256,uint160) view returns (uint256)',
    ];
    const quoter = new ethers.Contract(DEX.uniswap.quoter, quoterABI, provider);
    try {
      const decIn = tokenIn === STABLE_COIN.USDT ? 6 : 18;
      const decOut = tokenOut === STABLE_COIN.USDT ? 6 : 18;
      const amountInUnits = ethers.parseUnits(amountIn, decIn);

      const quotedAmount = await quoter.quoteExactInputSingle(
        tokenIn,
        tokenOut,
        BigInt(feeAmount),
        amountInUnits,
        0,
      );
      return ethers.formatUnits(quotedAmount, decOut);
    } catch (error) {
      console.error('Error getting quote:', error);
      throw new BadRequestException(`Error getting quote: ${error.message}`);
    }
  }

  /** Evaluate a single-direction arbitrage leg and return fee & price. */
  async evaluateArbitrage(
    tokenIn: string,
    tokenOut: string,
    amountIn: number | string,
  ): Promise<ArbPathResult> {
    const feeTiers = [FeeAmount.LOW, FeeAmount.MEDIUM, FeeAmount.HIGH];
    const pools = await Promise.all(
      feeTiers.map(async (fee) => {
        const amountOut = await this.getQuote(
          tokenIn,
          tokenOut,
          String(amountIn),
          fee,
        );
        return { fee, amountOut };
      }),
    );
    const valid = pools.filter((p) => !Number.isNaN(p.amountOut));
    if (valid.length === 0) {
      throw new BadRequestException('No valid pools found for arbitrage');
    }
    // pick the pool that gives the max output amountOut
    const best = valid.reduce((a, b) => (a.amountOut > b.amountOut ? a : b));
    const amountOut = Number(best.amountOut);
    const value = amountOut * Number(amountIn);
    return {
      fee: best.fee,
      value: value.toString(),
      amountOut: amountOut.toString(),
      amountIn,
      tokenIn,
      tokenOut,
    };
  }

  async getPairsByToken(tokenIn: string) {
    const limit = 50;
    const addresses = tokens.map((token) => token.address);
    const chunks = chunk(addresses, limit);
    const feeTiers = [FeeAmount.LOW, FeeAmount.MEDIUM, FeeAmount.HIGH];
    const results = await Promise.allSettled(
      chunks.map(async (chunk) => {
        const chunkResults = await Promise.allSettled(
          chunk.map(async (tokenOut) => {
            const pools = await Promise.allSettled(
              feeTiers.map(async (fee) => {
                try {
                  const price = await this.getQuote(
                    tokenIn,
                    tokenOut,
                    '1',
                    fee,
                  );
                  return { fee, price };
                } catch (error) {
                  return null; // Handle errors gracefully
                }
              }),
            );

            const validPools = pools
              .filter((p) => p.status === 'fulfilled' && p.value)
              .map((p: any) => p.value);

            return { tokenOut, pools: validPools };
          }),
        );

        return chunkResults
          .filter((r) => r.status === 'fulfilled' && r.value)
          .map((r: any) => r.value);
      }),
    );

    const validResults = results
      .filter((r) => r.status === 'fulfilled' && r.value)
      .flatMap((r: any) => r.value);

    return validResults;
  }
}
