export interface ISushiQuote {
  status: string;
  tokens: Token[];
  tokenFrom: number;
  tokenTo: number;
  swapPrice: number;
  priceImpact: number;
  amountIn: string;
  assumedAmountOut: string;
  gasSpent: number;
}

export interface Token {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
}
