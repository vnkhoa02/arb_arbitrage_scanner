export interface ArbPath {
  forward: ArbPathResult;
  backward: ArbPathResult;
  roundTrip: ArbRoundTrip;
}

export interface ArbPathResult {
  fee: number;
  value: number | string;
  tokenIn: string;
  amountIn: number | string;
  tokenOut: string;
  amountOut: number | string;
}

export interface ArbRoundTrip {
  profit: number | string;
  isProfitable: boolean;
}

export interface IToken {
  chainId: number;
  address: string;
  name: string;
  symbol: string;
  decimals: number;
  logoURI?: string;
}

export interface ITokenInfo {
  name: string;
  symbol: string;
  decimals: string;
  totalSupply: string;
}
