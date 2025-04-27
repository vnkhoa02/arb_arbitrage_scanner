import axios from 'axios';
import 'dotenv/config';
import { safeStringtify } from 'src/utils/bigintSerializer';
import { ISimpleArbitrageParams } from '../types';

const webhook = process.env.DISCORD_ETH_ARBITRAGE_WEBHOOK;

type NotifyData = {
  bundleHash?: string;
} & ISimpleArbitrageParams;
export async function sendNotify(data: NotifyData) {
  if (!data) return;

  if (!webhook) {
    console.error(
      'Discord webhook URL is not defined in environment variables.',
    );
    return;
  }

  try {
    const content = [
      `🚀 **New ETH Arbitrage Transaction Detected!**`,
      `🔗 **Bundle Hash**: ${data?.bundleHash}`,
      `🪙 **Token In:** \`${data.tokenIn}\``,
      `🪙 **Token Out:** \`${data.tokenOut}\``,
      `💰 **Borrow Amount:** \`${data.borrowAmount.toString()}\``,
      `💰**Profit (TokenIN):** \`${data.profit.toString()}\``,
      `⬅️ **Trade Data:** \`${safeStringtify(data)}\``,
    ].join('\n');

    await axios.post(webhook, { content });

    console.log('✅ Notification sent to Discord.');
  } catch (error) {
    console.error('❌ Error sending notification to Discord:', error);
  }
}
