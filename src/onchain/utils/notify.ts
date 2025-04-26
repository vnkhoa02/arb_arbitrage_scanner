import 'dotenv/config';
import axios from 'axios';
import { ISimpleArbitrageParams } from '../types';

const webhook = process.env.DISCORD_ETH_ARBITRAGE_WEBHOOK;
export async function sendNotify(
  trade: { tx: any; gasEstimate: string },
  data: ISimpleArbitrageParams,
) {
  if (!trade) {
    console.warn('No transaction hash provided.');
    return;
  }

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
      `➡️ **Forward Path:** \`${data.forwardPath}\``,
      `⬅️ **Backward Path:** \`${data.backwardPath}\``,
      `💰 **Borrow Amount:** \`${data.borrowAmount.toString()}\``,
      `⬅️ **Trade Data:** \`${JSON.stringify(trade)}\``,
    ].join('\n');

    console.log('sendNotify ->', content);

    await axios.post(webhook, { content });

    console.log('✅ Notification sent to Discord.');
  } catch (error) {
    console.error('❌ Error sending notification to Discord:', error);
  }
}
