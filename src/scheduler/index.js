const logger = require('../utils/logger');
const config = require('../config');
const { getActiveMonitoringRequests } = require('../services/supabaseClient');
const { processMonitoringRequest } = require('../services/workerService');

const DEFAULT_CHECK_INTERVAL_MINUTES = 30;

function getCheckIntervalMs() {
  const minutes = Number(process.env.CHECK_INTERVAL_MINUTES ?? config.checkIntervalMinutes ?? DEFAULT_CHECK_INTERVAL_MINUTES);
  return Math.max(1, minutes) * 60 * 1000;
}

async function runWorkerCycle() {
  logger.info('scheduler.cycle', 'Starting scheduler cycle', { intervalMinutes: process.env.CHECK_INTERVAL_MINUTES ?? config.checkIntervalMinutes });

  const requests = await getActiveMonitoringRequests();
  for (const request of requests) {
    try {
      await processMonitoringRequest(request);
    } catch (error) {
      logger.error('scheduler.request', 'Failed to process monitoring request', {
        requestId: request?.id,
        message: error.message
      });
    }
  }
}

function startScheduler() {
  const intervalMs = getCheckIntervalMs();
  logger.info('scheduler.start', 'Starting scheduler', { intervalMs });

  runWorkerCycle().catch((error) => {
    logger.error('scheduler.start', 'Initial scheduler cycle failed', { message: error.message });
  });

  setInterval(() => {
    runWorkerCycle().catch((error) => {
      logger.error('scheduler.cycle', 'Scheduler cycle failed', { message: error.message });
    });
  }, intervalMs);
}

module.exports = {
  startScheduler,
  getCheckIntervalMs,
  runWorkerCycle
};
