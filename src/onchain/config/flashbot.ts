import 'dotenv/config';
import { Wallet } from 'ethers';
import { provider } from 'src/dex/config/provider';

export const authSignerPrivateKey = process.env.AUTH_SIGNER_PRIVATE_KEY;
export const authSigner = new Wallet(authSignerPrivateKey, provider);

export const REPLAY_URL = 'https://rpc.titanbuilder.xyz';
