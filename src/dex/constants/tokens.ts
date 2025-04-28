export const TOKENS = {
  WETH: '0x82af49447d8a07e3bd95bd0d56f35241523fbab1',
};

export const STABLE_COIN = {
  DAI: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1',
  USDC: '0xaf88d065e77c8cc2239327c5edb3a432268e5831',
  USDT: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
};

export const STABLE_COIN_SET = new Set(
  Object.values(STABLE_COIN).map((addr) => addr.toLowerCase()),
);
