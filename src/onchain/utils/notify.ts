import 'dotenv/config';
import axios from 'axios';

const webhook = process.env.DISCORD_ETH_ARBITRAGE_WEBHOOK;

export async function sendNotify(tx: string) {
  if (!webhook) {
    console.error(
      'Discord webhook URL is not defined in environment variables.',
    );
    return;
  }

  try {
    await axios.post(webhook, {
      content: `🚀 New ETH transaction detected:\n${tx}`,
    });
    console.log('Notification sent to Discord.');
  } catch (error) {
    console.error('Error sending notification to Discord:', error);
  }
}
