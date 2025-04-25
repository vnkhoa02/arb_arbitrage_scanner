import { RouteWithValidQuote } from '@uniswap/smart-order-router';
import { Route, TokenIn, TokenOut } from '../types/quote';

export function extractRoutes(data: RouteWithValidQuote[]): Route[] {
  return data.flatMap((entry) => {
    const route = entry.route as any;
    if (!route?.pools?.length || !route?.tokenPath?.length) return [];

    return route.pools.map((pool, index) => {
      const tokenInRaw = route.tokenPath[index];
      const tokenOutRaw = route.tokenPath[index + 1];

      const tokenIn: TokenIn = {
        chainId: tokenInRaw.chainId,
        decimals: String(tokenInRaw.decimals),
        address: tokenInRaw.address,
        symbol: tokenInRaw.symbol,
      };

      const tokenOut: TokenOut = {
        chainId: tokenOutRaw.chainId,
        decimals: String(tokenOutRaw.decimals),
        address: tokenOutRaw.address,
        symbol: tokenOutRaw.symbol,
      };

      const r: Route = {
        type: entry.protocol,
        address: '', // Add pool address here if needed
        tokenIn,
        tokenOut,
        fee: String(pool.fee),
      };
      return r;
    });
  });
}
