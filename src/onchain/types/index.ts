export interface ISimpleArbitrageParams {
  tokenIn: string;
  tokenOut: string;
  forwardPath: string;
  forwardOutMin: bigint;
  backwardPath: string;
  backwardOutMin: bigint;
  borrowAmount: bigint;
}

export interface ISearchSimpleArbitrageTrade {
  tokenIn: string;
  amountIn: number;
  tokenOut: string;
}
