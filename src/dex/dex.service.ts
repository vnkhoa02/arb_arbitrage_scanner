import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import 'dotenv/config';
import { ethers } from 'ethers';
import { defaultProvider, provider } from './config/provider';
import { DEX } from './config/token';
import { MORALIS_PIRCE_API, UNISWAP_QUOTE_API } from './constants';
import { ArbPathResult, ITokenInfo } from './types';
import { IMoralisPrice } from './types/price';
import { IUniQuoteResponse } from './types/quote';
import { generateDirectRoutes, getTokenLocalInfo } from './utils';
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

  async getQuoteV2(tokenIn: string, tokenOut: string, amountIn: number) {
    try {
      // Fetch decimals in parallel
      const [decIn, decOut] = await Promise.all([
        this.getTokenDecimals(tokenIn),
        this.getTokenDecimals(tokenOut),
      ]);

      // Convert input amount to correct units using BigInt
      const amountInUnits = (
        BigInt(Math.floor(amountIn * 1e6)) *
        BigInt(10) ** BigInt(decIn - 6)
      ).toString();

      const payload = getQuotePayload(tokenIn, tokenOut, amountInUnits);

      const { data } = await axios.post<IUniQuoteResponse>(
        UNISWAP_QUOTE_API,
        payload,
        { headers: getQuoteHeader() },
      );
      const quoteData = data.quote;
      const bestOutput = quoteData.aggregatedOutputs
        .filter(
          (output) => output.token.toLowerCase() === tokenOut.toLowerCase(),
        )
        .reduce((max, curr) =>
          BigInt(curr.amount) > BigInt(max.amount) ? curr : max,
        );

      // Convert back to human-readable float
      const amountOut = (Number(bestOutput.amount) / 10 ** decOut).toString();
      const route =
        quoteData?.route ??
        generateDirectRoutes(
          tokenIn,
          tokenOut,
          decIn,
          amountIn,
          decOut,
          amountOut,
        );
      return { route, amountOut };
    } catch (error) {
      const message =
        error?.response?.data ?? error?.message ?? JSON.stringify(error);
      this.logger.error('Error getting quoteV2:', message);
      throw new BadRequestException(`Error getting quoteV2`);
    }
  }

  /**
   * Get price in usd per token
   * @param token_address
   * @returns price in usd / 1 token
   */
  async getTokenPriceInUsd(token_address: string): Promise<number> {
    const url = MORALIS_PIRCE_API.replace('token_address', token_address);
    const { data } = await axios.get<IMoralisPrice>(url, {
      headers: {
        'X-API-Key': process.env.MORALIS_API_KEY,
      },
    });
    return data.usdPrice;
  }

  /** Evaluate a single-direction arbitrage leg and return fee & price. */
  async evaluateArbitrageV3(
    tokenIn: string,
    tokenOut: string,
    amountIn: number | string,
  ): Promise<ArbPathResult> {
    const { amountOut, route } = await this.getQuoteV2(
      tokenIn,
      tokenOut,
      Number(amountIn),
    );
    return {
      route,
      amountOut: amountOut.toString(),
      amountIn,
      tokenIn,
      tokenOut,
    };
  }
}
