export interface IMoralisPrice {
  tokenName: string;
  tokenSymbol: string;
  tokenLogo: string;
  tokenDecimals: string;
  nativePrice: NativePrice;
  usdPrice: number;
  usdPriceFormatted: string;
  exchangeName: string;
  exchangeAddress: string;
  tokenAddress: string;
  priceLastChangedAtBlock: string;
  blockTimestamp: string;
  possibleSpam: boolean;
  verifiedContract: boolean;
  pairAddress: string;
  pairTotalLiquidityUsd: string;
  securityScore: number;
  usdPrice24hr: number;
  usdPrice24hrUsdChange: number;
  usdPrice24hrPercentChange: number;
  '24hrPercentChange': string;
}

export interface NativePrice {
  value: string;
  decimals: number;
  name: string;
  symbol: string;
  address: string;
}
