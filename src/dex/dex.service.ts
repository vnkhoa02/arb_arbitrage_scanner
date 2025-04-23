import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { FeeAmount } from '@uniswap/v3-sdk';
import { ethers } from 'ethers';
import chunk from 'lodash/chunk';
import { defaultProvider, provider } from './config/provider';
import { DEX } from './config/token';
import { tokens } from './constants/tokens';
import { ArbPathResult, ITokenInfo } from './types';

@Injectable()
export class DexService {
  private readonly logger = new Logger(DexService.name);
  private readonly tokenInfoMap = new Map<string, ITokenInfo>();

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
  async getTokenBasicInfo(tokenAddress: string): Promise<ITokenInfo> {
    const check = this.tokenInfoMap.get(tokenAddress);
    if (check) return check;
    try {
      const ERC20_ABI = [
        'function name() view returns (string)',
        'function symbol() view returns (string)',
        'function decimals() view returns (uint8)',
        'function totalSupply() view returns (uint256)',
      ];
      if (!ethers.isAddress(tokenAddress))
        throw new BadRequestException('Invalid token address');
      const contract = new ethers.Contract(
        tokenAddress,
        ERC20_ABI,
        defaultProvider,
      );

      const [name, symbol, decimals, totalSupply] = await Promise.all([
        contract.name(),
        contract.symbol(),
        contract.decimals(),
        contract.totalSupply(),
      ]);

      const token = {
        name,
        symbol,
        decimals: BigInt(decimals).toString(),
        totalSupply: ethers.formatUnits(totalSupply, decimals),
      };
      this.tokenInfoMap.set(tokenAddress, token);
      return token;
    } catch (error) {
      this.logger.error('Error getting token info:', error);
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

  async getTokenDecimals(tokenAddress: string): Promise<number> {
    const tokenInfo = await this.getTokenBasicInfo(tokenAddress);
    return Number(tokenInfo.decimals);
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
  async getQuoteV3(
    tokenIn: string,
    tokenOut: string,
    amountIn: string,
    feeAmount: string | number,
  ): Promise<string> {
    const quoterABI = [
      'function quoteExactInputSingle(address,address,uint24,uint256,uint160) view returns (uint256)',
    ];
    const quoter = new ethers.Contract(
      DEX.uniswapV3.quoter,
      quoterABI,
      provider,
    );
    try {
      const [decIn, decOut] = await Promise.all([
        this.getTokenDecimals(tokenIn),
        this.getTokenDecimals(tokenOut),
      ]);
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
      this.logger.error('Error getting quote:', error);
      throw new BadRequestException(`Error getting quote: ${error.message}`);
    }
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
  async getQuoteV2(
    tokenIn: string,
    tokenOut: string,
    amountIn: string,
  ): Promise<string> {
    try {
      const uniswapV2RouterABI = [
        'function getAmountsOut(uint256 amountIn, address[] memory path) external view returns (uint256[] memory)',
      ];
      const [decIn, decOut] = await Promise.all([
        this.getTokenDecimals(tokenIn),
        this.getTokenDecimals(tokenOut),
      ]);
      const amountInUnits = ethers.parseUnits(amountIn, decIn);

      const uniswapV2Router = new ethers.Contract(
        DEX.uniswapV2.router,
        uniswapV2RouterABI,
        provider,
      );

      const path = [tokenIn, tokenOut];
      const amountsOut = await uniswapV2Router.getAmountsOut(
        amountInUnits,
        path,
      );

      return ethers.formatUnits(amountsOut[1], decOut);
    } catch (error) {
      console.error('Error getting Uniswap V2 quote:', error);
      throw new BadRequestException(
        `Uniswap V2 quote failed: ${error.message}`,
      );
    }
  }

  /** Evaluate a single-direction arbitrage leg and return fee & price. */
  async evaluateArbitrageV2(
    tokenIn: string,
    tokenOut: string,
    amountIn: number | string,
  ): Promise<ArbPathResult> {
    const amountOut = await this.getQuoteV2(
      tokenIn,
      tokenOut,
      String(amountIn),
    );
    const value = Number(amountOut) * Number(amountIn);
    return {
      fee: -1,
      value: value.toString(),
      amountOut: amountOut.toString(),
      amountIn,
      tokenIn,
      tokenOut,
    };
  }

  /** Evaluate a single-direction arbitrage leg and return fee & price. */
  async evaluateArbitrageV3(
    tokenIn: string,
    tokenOut: string,
    amountIn: number | string,
  ): Promise<ArbPathResult> {
    const feeTiers = [FeeAmount.LOW, FeeAmount.MEDIUM, FeeAmount.HIGH];
    const pools = await Promise.all(
      feeTiers.map(async (fee) => {
        const amountOut = await this.getQuoteV3(
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

    return null;
  }
}
