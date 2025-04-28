import 'dotenv/config';
import { Wallet } from 'ethers';
import { defaultProvider, mevProvider } from 'src/dex/config/provider';

const PRIVATE_KEY = process.env.PRIVATE_KEY;

export const signer = new Wallet(PRIVATE_KEY, defaultProvider);
export const mevSigner = new Wallet(PRIVATE_KEY, mevProvider);

export const TITAN_RPC = 'https://rpc.titanbuilder.xyz';
export const BEAVER_BUILD_RPC = 'https://rpc.beaverbuild.org';
export const FLASH_BOT_RPC = 'https://relay.flashbots.net';
