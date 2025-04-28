import 'dotenv/config';
import { ethers } from 'ethers';

export const provider = new ethers.providers.JsonRpcProvider(
  process.env.DRPC_MAINNET_URL,
  1,
);

export const mevProvider = new ethers.providers.JsonRpcProvider(
  'https://rpc.flashbots.net/fast',
  1,
);
