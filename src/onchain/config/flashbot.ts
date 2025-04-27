import 'dotenv/config';
import { Wallet } from 'ethers';
import { provider } from 'src/dex/config/provider';

export const authSignerPrivateKey = process.env.AUTH_SIGNER_PRIVATE_KEY;
export const flashBotSigner = new Wallet(authSignerPrivateKey, provider);

export const TITAN_RPC = 'https://rpc.titanbuilder.xyz';
export const BEAVER_BUILD_RPC = 'https://rpc.beaverbuild.org';
export const FLASH_BOT_RPC = 'https://relay.flashbots.net';
