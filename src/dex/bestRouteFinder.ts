import { Injectable } from '@nestjs/common';
import { Protocol } from '@uniswap/router-sdk';
import { ChainId } from '@uniswap/sdk';
import { CurrencyAmount, Percent, Token, TradeType } from '@uniswap/sdk-core';
import { AlphaRouter } from '@uniswap/smart-order-router';
import { defaultProvider } from './config/provider';
import { RouteOptions, RouteResult } from './types/route';
import { extractRoutes } from './utils/extractRoutes';

enum UniversalRouterVersion {
  V1_2 = '1.2',
  V2_0 = '2.0',
}

@Injectable()
export class BestRouteFinder {
  private router: AlphaRouter;
  private chainId = ChainId.MAINNET.valueOf();

  constructor() {
    this.router = new AlphaRouter({
      chainId: this.chainId,
      provider: defaultProvider,
    });
  }

  /**
   * Finds the best swap route between two tokens for a given exact input amount.
   * @param tokenInAddress  Address of the input token (e.g. WETH)
   * @param tokenInDecimals Decimals of the input token
   * @param tokenOutAddress Address of the output token (e.g. USDC)
   * @param tokenOutDecimals Decimals of the output token
   * @param amountInRaw     Raw amount in smallest units (BigInt or numeric string)
   * @param options         Optional route parameters
   */
  public async findBestRoute(
    tokenInAddress: string,
    tokenInDecimals: number,
    tokenOutAddress: string,
    tokenOutDecimals: number,
    amountInRaw: string | bigint,
    options: RouteOptions = {},
  ): Promise<RouteResult> {
    // Wrap tokens for SDK
    const tokenIn = new Token(this.chainId, tokenInAddress, tokenInDecimals);
    const tokenOut = new Token(this.chainId, tokenOutAddress, tokenOutDecimals);

    // Build CurrencyAmount
    const raw =
      typeof amountInRaw === 'bigint' ? amountInRaw : BigInt(amountInRaw);
    const amountIn = CurrencyAmount.fromRawAmount(tokenIn, raw.toString());

    // Set trade type Exact Input (0)
    const tradeType = TradeType.EXACT_INPUT;

    // Default slippage 0.2%
    const slippage = options.slippageTolerance ?? new Percent(20, 10_000);
    // Query route
    const route = await this.router.route(
      amountIn,
      tokenOut,
      tradeType,
      {
        slippageTolerance: slippage,
        type: 0,
        version: UniversalRouterVersion.V2_0,
      },
      {
        protocols: [Protocol.V3],
      },
    );

    if (!route) {
      return null;
    }
    const routes = [extractRoutes(route.route)];
    return {
      quote: route.quoteGasAdjusted.toFixed(tokenOut.decimals),
      amountOut: route.quote.toFixed(),
      gasUsed: route.estimatedGasUsed.toBigInt(),
      gasPriceWei: route.gasPriceWei.toBigInt(),
      value: BigInt(route.methodParameters.value || '0'),
      routes,
    };
  }
}
