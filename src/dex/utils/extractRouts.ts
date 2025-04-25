import { RouteWithValidQuote } from '@uniswap/smart-order-router';
import { Route, TokenIn, TokenOut } from '../types/quote';

export function extractRoutes(data: RouteWithValidQuote[]): Route[] {
  return data.flatMap((entry) => {
    const amountIn = entry.amount.numerator.toString();
    const amountOut = entry.quote.numerator.toString();
    const route = entry.route as any;

    if (!route?.pools?.length) return [];

    return route.pools.map((pool) => {
      const tokenIn: TokenIn = {
        chainId: pool.token0.chainId,
        decimals: String(pool.token0.decimals),
        address: pool.token0.address,
        symbol: pool.token0.symbol,
      };

      const tokenOut: TokenOut = {
        chainId: pool.token1.chainId,
        decimals: String(pool.token1.decimals),
        address: pool.token1.address,
        symbol: pool.token1.symbol,
      };

      const r: Route = {
        type: entry.protocol,
        address: '', // You can update this if needed
        tokenIn,
        tokenOut,
        fee: String(pool.fee),
        liquidity: pool?.liquidity?.toString?.(),
        sqrtRatioX96: pool?.sqrtRatioX96?.toString?.(),
        tickCurrent: pool?.tickCurrent?.toString?.(),
        amountIn,
        amountOut,
      };

      return r;
    });
  });
}
