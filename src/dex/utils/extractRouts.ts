import { RouteWithValidQuote } from '@uniswap/smart-order-router';
import { Route, TokenIn, TokenOut } from '../types/quote';

export function extractRoutes(data: RouteWithValidQuote[]): Route[] {
  return data
    .map((entry) => {
      const tokens = entry.tokenPath;
      return tokens.map((t) => {
        const tokenIn: TokenIn = {
          chainId: t.chainId,
          decimals: String(t.decimals),
          address: t.address,
          symbol: t?.symbol,
        };
        const tokenOut: TokenOut = {
          chainId: t.chainId,
          decimals: String(t.decimals),
          address: t.address,
          symbol: t?.symbol,
        };

        const r: Route = {
          type: entry.protocol, // e.g. "V3"
          address: '', // if you have pool contract address, fill here
          tokenIn,
          tokenOut,
          fee: String(t.fee),
          liquidity: t?.liquidity.shift(),
          sqrtRatioX96: t?.sqrtRatioX96?.shift(),
          tickCurrent: t?.tickCurrent?.toString(),
        };
        return r;
      });
    })
    .filter(Boolean)
    .flat();
}
