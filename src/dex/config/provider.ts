import 'dotenv/config';
import { ethers } from 'ethers';

export const provider = new ethers.providers.JsonRpcProvider(
  process.env.DRPC_MAINNET_URL,
);
