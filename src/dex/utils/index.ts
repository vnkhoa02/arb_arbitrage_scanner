import { ChainId } from '@uniswap/sdk';
import { tokens } from '../constants/tokens';
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
        chainId: ChainId.MAINNET,
        decimals: decIn.toString(),
        address: tokenOut,
      },
      tokenOut: {
        chainId: ChainId.MAINNET,
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
