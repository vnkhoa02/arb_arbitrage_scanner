import { Percent } from '@uniswap/sdk-core';

export interface RouteOptions {
  slippageTolerance?: Percent;
  deadlineSeconds?: number;
  recipient?: string;
}

export interface RouteResult {
  quote: string;
  quoteGasAdjusted: string;
  gasUsed: bigint;
  gasPriceWei: bigint;
  calldata: string;
  value: bigint;
}
