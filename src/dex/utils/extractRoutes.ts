import { RouteWithValidQuote, V3Route } from '@uniswap/smart-order-router';
import { Route, TokenIn, TokenOut } from '../types/quote';

export function extractRoutes(vaildRoutes: RouteWithValidQuote[]): Route[] {
  const route = vaildRoutes[0]?.route as V3Route;
  const pools = route?.pools ?? [];
  return pools.map((pool, index) => {
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
      type: route.protocol,
      address: '', // Add pool address here if needed
      tokenIn,
      tokenOut,
      fee: String(pool.fee),
    };
    return r;
  });
}
