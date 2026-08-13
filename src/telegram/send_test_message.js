require('dotenv').config();
const fetch = global.fetch;
const config = require('../config');

if (!config.telegramBotToken) {
  console.error('TELEGRAM_BOT_TOKEN is not configured.');
  process.exit(1);
}

const TELEGRAM_BASE = `https://api.telegram.org/bot${config.telegramBotToken}`;

async function callTelegram(method, body) {
  const response = await fetch(`${TELEGRAM_BASE}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await response.json();
  if (!data.ok) {
    console.error('Telegram API error:', data.description);
    process.exit(1);
  }
  return data.result;
}

async function main() {
  const chatId = process.argv[2];
  if (!chatId) {
    console.error('Usage: node src/telegram/send_test_message.js <chat_id>');
    process.exit(1);
  }

  const safeText = 'Test message from Uzbekistan Ticket Monitor bot.'
    .replace(/([_*\[\]()~`>#+\-=|{}.!])/g, '\\$1');
  const result = await callTelegram('sendMessage', {
    chat_id: chatId,
    text: safeText
  });

  console.log('Message sent:', JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error('Error sending test message:', error.message);
  process.exit(1);
});