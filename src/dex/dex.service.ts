import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import axios from 'axios';
import 'dotenv/config';
import { ethers } from 'ethers';
import { BestRouteFinder } from './bestRouteFinder';
import { CACHE_TTL_MS } from './config';
import { provider } from './config/provider';
import { UNISWAP_QUOTE_API } from './constants';
import { ArbPathResult, CacheEntry, ITokenInfo } from './types';
import { IUniQuoteResponse } from './types/quote';
import {
  generateCacheKey,
  generateDirectRoutes,
  getTokenLocalInfo,
} from './utils';
import { getQuoteHeader, getQuotePayload } from './utils/getQuote';

@Injectable()
export class DexService {
  private readonly logger = new Logger(DexService.name);
  private readonly quoteCache = new Map<string, CacheEntry>();

  constructor(private readonly bestRouteFinder: BestRouteFinder) {}

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
      if (!ethers.utils.isAddress(tokenAddress))
        throw new BadRequestException('Invalid token address');
      const contract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);

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

  async getQuoteV2(tokenIn: string, tokenOut: string, amountIn: string) {
    try {
      // Fetch token decimals in parallel
      const [decIn, decOut] = await Promise.all([
        this.getTokenDecimals(tokenIn),
        this.getTokenDecimals(tokenOut),
      ]);
      const amountInUnits = ethers.utils.parseUnits(amountIn, decIn).toString();
      const payload = getQuotePayload(tokenIn, tokenOut, amountInUnits);
      const { data } = await axios.post<IUniQuoteResponse>(
        UNISWAP_QUOTE_API,
        payload,
        { headers: getQuoteHeader() },
      );

      const quoteData = data.quote;

      const outputs = quoteData.aggregatedOutputs.filter(
        (output) => output.token.toLowerCase() === tokenOut.toLowerCase(),
      );

      // Find the best output by comparing amounts
      const bestOutput = outputs.reduce((max, curr) =>
        BigInt(curr.amount) > BigInt(max.amount) ? curr : max,
      );

      const amountOut = ethers.utils.formatUnits(bestOutput.amount, decOut);

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
      this.logger.error('Error getting quoteV2:', error);
      // Fallback to getQuote
      return this.getQuote(tokenIn, tokenOut, amountIn);
    }
  }

  async getQuote(tokenIn: string, tokenOut: string, amountIn: string) {
    try {
      const [decIn, decOut] = await Promise.all([
        this.getTokenDecimals(tokenIn),
        this.getTokenDecimals(tokenOut),
      ]);
      const result = await this.bestRouteFinder.findBestRoute(
        tokenIn,
        decIn,
        tokenOut,
        decOut,
        ethers.utils.parseUnits(amountIn, decIn).toBigInt(),
      );
      return {
        route: result.routes,
        amountOut: result.amountOut,
      };
    } catch (error) {
      this.logger.error(`Error while getQuoteSlow`, error);
      throw new InternalServerErrorException('Error while getQuoteSlow');
    }
  }

  /** Evaluate a single-direction arbitrage leg and return fee & price. */
  async evaluateArbitrage(
    tokenIn: string,
    tokenOut: string,
    amountIn: string,
  ): Promise<ArbPathResult> {
    const { amountOut, route } = await this.getQuote(
      tokenIn,
      tokenOut,
      amountIn,
    );
    return {
      route,
      amountOut,
      amountIn,
      tokenIn,
      tokenOut,
    };
  }

  /** Evaluate a single-direction arbitrage leg and return fee & price. */
  async evaluateArbitrageV3(
    tokenIn: string,
    tokenOut: string,
    amountIn: string,
  ): Promise<ArbPathResult> {
    const cacheKey = generateCacheKey(tokenIn, tokenOut);
    const now = Date.now();
    const cached = this.quoteCache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      // this.logger.debug(`Using cached quote for ${cacheKey}`);
      return cached.result;
    }
    const { amountOut, route } = await this.getQuoteV2(
      tokenIn,
      tokenOut,
      amountIn,
    );
    const result: ArbPathResult = {
      route,
      amountOut: amountOut.toString(),
      amountIn,
      tokenIn,
      tokenOut,
    };
    this.quoteCache.set(cacheKey, {
      result,
      expiresAt: now + CACHE_TTL_MS,
    });
    return result;
  }
}
