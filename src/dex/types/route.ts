import { Percent } from '@uniswap/sdk-core';
import { Route } from './quote';

export interface RouteOptions {
  slippageTolerance?: Percent;
  deadlineSeconds?: number;
  recipient?: string;
}

export interface RouteResult {
  quote: string;
  amountOut: string;
  gasUsed: bigint;
  gasPriceWei: bigint;
  value?: bigint;
  routes: Route[][];
}
