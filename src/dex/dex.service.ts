import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { FeeAmount } from '@uniswap/v3-sdk';
import axios, { isAxiosError } from 'axios';
import { ethers } from 'ethers';
import { defaultProvider, provider } from './config/provider';
import { DEX } from './config/token';
import { UNISWAP_QUOTE_API } from './constants';
import { ArbPathResult, ITokenInfo } from './types';
import { IUniQuoteResponse } from './types/quote';
import { getTokenLocalInfo } from './utils';
import { getQuoteHeader, getQuotePayload } from './utils/getQuote';

@Injectable()
export class DexService {
  private readonly logger = new Logger(DexService.name);

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
    const check = getTokenLocalInfo(tokenAddress);
    if (check) return check as unknown as ITokenInfo;
    try {
      const ERC20_ABI = [
        'function name() view returns (string)',
        'function symbol() view returns (string)',
        'function decimals() view returns (uint8)',
      ];
      if (!ethers.isAddress(tokenAddress))
        throw new BadRequestException('Invalid token address');
      const contract = new ethers.Contract(
        tokenAddress,
        ERC20_ABI,
        defaultProvider,
      );

      const [name, symbol, decimals] = await Promise.all([
        contract.name(),
        contract.symbol(),
        contract.decimals(),
      ]);

      const token = {
        name,
        symbol,
        decimals: BigInt(decimals).toString(),
      };
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
  async getQuote(
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

  async getQuoteV2(
    tokenIn: string,
    tokenOut: string,
    amountIn: string,
  ): Promise<string> {
    try {
      const decIn = await this.getTokenDecimals(tokenIn);
      const amount = Number(amountIn) * Math.pow(10, decIn);
      const payload = getQuotePayload(tokenIn, tokenOut, amount.toString());
      const response = await axios.post<IUniQuoteResponse>(
        UNISWAP_QUOTE_API,
        payload,
        {
          headers: getQuoteHeader(),
        },
      );
      const quote = response.data.quote;
      const { aggregatedOutputs } = quote;
      const best = aggregatedOutputs
        .filter((a) => (a.token = tokenIn))
        .reduce((a, b) => (a.amount < b.amount ? a : b));
      return best.amount;
    } catch (error) {
      if (isAxiosError(error)) {
        this.logger.error('Error getting quoteV2:', error.response.data);
      } else {
        this.logger.error('Error getting quoteV2:', error);
      }
      throw new BadRequestException(`Error getting quoteV2: ${error.message}`);
    }
  }

  private async getPools(
    tokenIn: string,
    tokenOut: string,
    amountIn: number | string,
  ) {
    const feeTiers = [FeeAmount.LOW, FeeAmount.MEDIUM, FeeAmount.HIGH];
    return await Promise.all(
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
  }

  /** Evaluate a single-direction arbitrage leg and return fee & price. */
  async evaluateArbitrageV3(
    tokenIn: string,
    tokenOut: string,
    amountIn: number | string,
  ): Promise<ArbPathResult> {
    const pools = await this.getPools(tokenIn, tokenOut, amountIn);
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

  /**
   * Find all pools that can be traded with tokenIn
   * @param tokenIn
   */
  async findPoolsToken(tokenIn: string, tokenOut: string) {}
}
