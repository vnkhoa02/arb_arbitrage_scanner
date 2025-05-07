import { CHAIN_ID } from '../config';

type TokenAddresses = {
  WETH: string;
};

type StableCoinAddresses = {
  DAI: string;
  USDC: string;
  USDT: string;
};

type ChainConfig = {
  TOKENS: TokenAddresses;
  STABLE_COIN: StableCoinAddresses;
};

type Config = {
  [chainId: number]: ChainConfig;
};

const CONFIG: Config = {
  42161: {
    // Arbitrum
    TOKENS: {
      WETH: '0x82af49447d8a07e3bd95bd0d56f35241523fbab1',
    },
    STABLE_COIN: {
      DAI: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1',
      USDC: '0xaf88d065e77c8cc2239327c5edb3a432268e5831',
      USDT: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
    },
  },
  1: {
    // Ethereum Mainnet
    TOKENS: {
      WETH: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    },
    STABLE_COIN: {
      DAI: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
      USDC: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
      USDT: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    },
  },
};

if (!CONFIG[CHAIN_ID]) {
  throw new Error(`Unsupported CHAIN_ID: ${CHAIN_ID}`);
}

export const { TOKENS, STABLE_COIN } = CONFIG[CHAIN_ID];
