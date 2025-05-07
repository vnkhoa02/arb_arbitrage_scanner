import 'dotenv/config';
import { HttpsProxyAgent } from 'https-proxy-agent';

const proxy = process.env.BRIGHT_DATA_PROXY;

export const proxyAgent = new HttpsProxyAgent(proxy);
