const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

function requiredEnv(name) {
  if (!process.env[name]) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return process.env[name];
}

const config = {
  railwayApiUrl: process.env.RAILWAY_API_URL || 'https://eticket.railway.uz/api/v3/handbook/trains/list',
  railwayToken: process.env.RAILWAY_TOKEN,
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN,
  // Empty list = whitelist disabled (allow all chats), e.g. for local dev without the env var set.
  allowedTelegramIds: (process.env.ALLOWED_TELEGRAM_IDS || process.env.ALLOWED_USER_IDS || '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean)
    .map(Number),
  checkIntervalMinutes: Number(process.env.CHECK_INTERVAL_MINUTES ?? 3),
  defaultRoute: {
    date: process.env.DEFAULT_TEST_DATE || '2026-09-08',
    depStationCode: process.env.DEFAULT_DEP_STATION_CODE || '2900000',
    arvStationCode: process.env.DEFAULT_ARV_STATION_CODE || '2900800'
  },
  getRailwayToken() {
    return requiredEnv('RAILWAY_TOKEN');
  }
};

module.exports = config;
