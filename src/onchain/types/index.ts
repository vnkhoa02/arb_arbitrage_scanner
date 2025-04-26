export interface ISimpleArbitrageParams {
  tokenIn: string;
  tokenOut: string;
  forwardPath: string;
  forwardOutMin: bigint;
  backwardPath: string;
  backwardOutMin: bigint;
  borrowAmount: bigint;
  profit: number | string;
}

export interface ISimpleArbitrageTrade {
  tokenIn: string;
  amountIn: number;
  tokenOut: string;
}
