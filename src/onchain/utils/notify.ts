import axios from 'axios';
import 'dotenv/config';
import { safeStringtify } from 'src/utils/bigintSerializer';
import { ISimpleArbitrageParams } from '../types';
import retry from 'async-await-retry';

const webhook = process.env.DISCORD_ETH_ARBITRAGE_WEBHOOK;

type NotifyData = {
  tx?: string;
  bundleHash?: string;
  builder?: string;
} & ISimpleArbitrageParams;

export async function sendNotify(data: NotifyData) {
  if (!data) return;

  if (!webhook) {
    console.error(
      'Discord webhook URL is not defined in environment variables.',
    );
    return;
  }

  const content = [
    `🚀 **New ETH Arbitrage Transaction Detected!**`,
    `🪙 **Token In:** \`${data.tokenIn}\``,
    `🪙 **Token Out:** \`${data.tokenOut}\``,
    `💰 **Borrow Amount:** \`${data.borrowAmount.toString()}\``,
    `💰 **Profit (TokenIN):** \`${data.profit.toString()}\``,
    `⬅️ **Trade Data:** \`${safeStringtify(data)}\``,
  ];

  if (data.tx) {
    const etherscan = `🔗 [Etherscan](https://etherscan.io/tx/${data.tx})`;
    content.push(etherscan);
  }
  if (data.bundleHash && data.builder) {
    const builder = `🔗 **${data.builder}**: ${data.bundleHash}`;
    content.push(builder);
  }

  try {
    await retry(
      async () => {
        await axios.post(webhook, { content: content.join('\n') });
        console.log('✅ Notification sent to Discord.');
      },
      null,
      {
        retriesMax: 4,
        interval: 2000, // No delay between retries
        exponential: false, // Enable exponential backoff
      },
    );
  } catch (error) {
    console.error('❌ Error sending notification to Discord:', error);
  }
}
