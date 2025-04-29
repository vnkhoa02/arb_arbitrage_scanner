import 'dotenv/config';
import { ethers } from 'ethers';

export const defaultProvider = new ethers.providers.JsonRpcProvider(
  process.env.INFURA_MAINNET_URL,
);

export const provider = new ethers.providers.JsonRpcProvider(
  process.env.DRPC_MAINNET_URL,
);

export const mevProvider = new ethers.providers.JsonRpcProvider(
  'https://rpc.flashbots.net/fast',
);
