import 'dotenv/config';
import axios from 'axios';
import { ISimpleArbitrageParams } from '../types';

const webhook = process.env.DISCORD_ETH_ARBITRAGE_WEBHOOK;

export async function sendNotify(data: ISimpleArbitrageParams) {
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
      // `🔗 [View Transaction](https://etherscan.io/tx/${trade})`,
      `🪙 **Token In:** \`${data.tokenIn}\``,
      `🪙 **Token Out:** \`${data.tokenOut}\``,
      `💰 **Borrow Amount:** \`${data.borrowAmount.toString()}\``,
      `💰**Profit (TokenIN):** \`${data.profit.toString()}\``,
      `⬅️ **Trade Data:** \`${JSON.stringify(data)}\``,
    ].join('\n');

    await axios.post(webhook, { content });

    console.log('✅ Notification sent to Discord.');
  } catch (error) {
    console.error('❌ Error sending notification to Discord:', error);
  }
}
