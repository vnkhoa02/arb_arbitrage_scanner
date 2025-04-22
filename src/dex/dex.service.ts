import { BadRequestException, Injectable } from '@nestjs/common';
import { ethers, toBigInt } from 'ethers';
import { provider } from './config';
import { DEX } from './config/token';
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
   * @returns The quoted amount of the output token.
   */
  async getQuote(
    tokenIn: string,
    tokenOut: string,
    amountIn: string,
    sdkVersion = 3,
  ) {
    try {
      const quoterABI = [
        'function quoteExactInputSingle(address,address,uint24,uint256,uint160) view returns (uint256)',
      ];
      const quoter = new ethers.Contract(
        DEX.uniswap.quoter,
        quoterABI,
        provider,
      );
      const amountInBigInt = ethers.parseUnits(amountIn, 18);
      const feeAmount = FeeAmount.MEDIUM; // 0.3% fee tier
      const sqrtPriceLimitX96 = 0;

      const quotedAmount = await quoter.quoteExactInputSingle(
        tokenIn,
        tokenOut,
        toBigInt(feeAmount),
        amountInBigInt,
        sqrtPriceLimitX96,
      );

      return quotedAmount;
    } catch (error) {
      console.error('Error getting quote:', error);
      throw new BadRequestException(`Error getting quote: ${error.message}`);
    }
  }
}
