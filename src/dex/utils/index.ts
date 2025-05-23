import { CHAIN_ID } from '../config';
import { tokens } from '../data/tokens';
import { Route } from '../types/quote';

export function getTokenLocalInfo(address: string) {
  const token = tokens.find(
    (t) => t.address.toLowerCase() == address.toLowerCase(),
  );
  return token;
}

export function generateDirectRoutes(
  tokenIn: string,
  tokenOut: string,
  decIn: string | number,
  amountIn: string | number,
  decOut: string | number,
  amountOut: string | number,
): Route[][] {
  const defaultRoute = [
    {
      type: 'v3-pool',
      address: tokenIn,
      tokenIn: {
        chainId: CHAIN_ID,
        decimals: decIn.toString(),
        address: tokenOut,
      },
      tokenOut: {
        chainId: CHAIN_ID,
        decimals: decOut.toString(),
        address: tokenOut,
      },
      fee: '500',
      amountIn: amountIn.toString(),
      amountOut: amountOut.toString(),
    },
  ];
  return [defaultRoute];
}

export function generateCacheKey(tokenIn: string, tokenOut: string): string {
  return `${tokenIn}-${tokenOut}`;
}
