import { BadRequestException, Injectable } from '@nestjs/common';
import { ethers } from 'ethers';
import { provider } from './config/provider';
import { DEX, STABLE_COIN } from './config/token';
import { ArbPathResult, ArbPath, ArbRoundTrip } from './types';
import { FeeAmount } from '@uniswap/v3-sdk';

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
  private async evaluateArbitrage(
    tokenIn: string,
    tokenOut: string,
    amountIn: number | string,
  ): Promise<ArbPathResult> {
    const feeTiers = [FeeAmount.LOW, FeeAmount.MEDIUM, FeeAmount.HIGH];
    const pools = await Promise.all(
      feeTiers.map(async (fee) => {
        const price = await this.getQuote(
          tokenIn,
          tokenOut,
          String(amountIn),
          fee,
        );
        return { fee, price };
      }),
    );
    const valid = pools.filter((p) => !Number.isNaN(p.price));
    if (valid.length === 0) {
      throw new BadRequestException('No valid pools found for arbitrage');
    }
    // pick the pool that gives the max output price
    const best = valid.reduce((a, b) => (a.price > b.price ? a : b));
    const price = Number(best.price);
    const amountOut = price * Number(amountIn);
    return {
      fee: best.fee,
      price: price.toString(),
      amountOut: amountOut.toString(),
      amountIn,
      tokenIn,
      tokenOut,
    };
  }

  /** Perform both forward and backward legs and return full ArbPath */
  async simpleArbitrage(
    tokenIn: string,
    tokenOut: string,
    amountIn: number,
  ): Promise<ArbPath> {
    // Forward leg
    const forward: ArbPathResult = await this.evaluateArbitrage(
      tokenIn,
      tokenOut,
      amountIn,
    );
    // Backward leg: swapping amountOut of tokenOut back to tokenIn
    const backward: ArbPathResult = await this.evaluateArbitrage(
      tokenOut,
      tokenIn,
      forward.amountOut,
    );

    // Round-trip profit in original tokenIn
    const forwardTotal = Number(forward.amountIn) * Number(forward.price);
    const backwardTotal = Number(backward.amountIn) * Number(backward.price);
    const profit = backwardTotal - forwardTotal;

    const roundTrip: ArbRoundTrip = {
      profit: profit.toString(),
      isProfitable: profit > 0,
    };

    return {
      forward,
      backward,
      roundTrip,
    };
  }
}
