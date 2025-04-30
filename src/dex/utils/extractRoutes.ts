import { RouteWithValidQuote, V3Route } from '@uniswap/smart-order-router';
import { Route, TokenIn, TokenOut } from '../types/quote';
import { BigNumber, ethers } from 'ethers';

export function extractRoutes(
  vaildRoutes: RouteWithValidQuote[],
  amountInTotal: bigint,
): Route[][] {
  return vaildRoutes.map((v) => {
    const route = v?.route as V3Route;
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

      const rawAmount = BigNumber.from(amountInTotal).mul(v.percent).div(100);
      const r: Route = {
        type: route.protocol,
        address: '',
        tokenIn,
        tokenOut,
        amountIn: rawAmount.toString(),
        fee: String(pool.fee),
      };
      return r;
    });
  });
}
