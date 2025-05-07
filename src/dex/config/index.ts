import 'dotenv/config';

export const CHAIN_ID = process.env.CHAIN_ID
  ? Number(process.env.CHAIN_ID)
  : 42161;

export const DEX = {
  uniswapV3: {
    router: '0xE592427A0AEce92De3Edee1F18E0157C05861564',
    name: 'Uniswap V3',
  },
};

export const CACHE_TTL_MS = 1 * 60 * 1000; // 1 minute
