export interface Pools {
  usdt_x: Pool[];
  x_weth: Pool[];
}

export interface Pool {
  id: string;
  feeTier: string;
  liquidity: string;
  volumeUSD: string;
  token0: Token;
  token1: Token;
}

export interface Token {
  id: string;
  symbol: string;
  name: string;
  decimals: string;
}

export interface JoinedPool {
  intermediateToken: Token;
  aPool: Pool;
  bPool: Pool;
}
