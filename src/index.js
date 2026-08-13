const config = require('./config');
const logger = require('./utils/logger');
const { startScheduler } = require('./scheduler');
const { startTelegramPolling } = require('./services/telegramBot');
const { runHealthCheck } = require('./cli/healthCheck');

async function main() {
  logger.info('app.start', 'Starting Uzbekistan Ticket Monitor service');

  const health = await runHealthCheck();
  if (!health.railway || !health.supabase) {
    logger.warn('app.start', 'Health check failed; worker and Telegram polling may not operate correctly');
  }

  startScheduler();
  startTelegramPolling();
}

main().catch((error) => {
  logger.error('app.error', 'Fatal startup error', { message: error.message });
  process.exitCode = 1;
});
