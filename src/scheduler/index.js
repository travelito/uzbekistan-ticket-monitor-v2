const logger = require('../utils/logger');
const config = require('../config');
const { getActiveMonitoringRequests } = require('../services/supabaseClient');
const { processMonitoringRequest } = require('../services/workerService');
const { refreshSession, startSessionRefresher } = require('../eticket/session');

const DEFAULT_CHECK_INTERVAL_MINUTES = 7;

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

  // Initialize session first, then start periodic refresher
  refreshSession()
    .then(() => {
      logger.info('scheduler.start', 'Initial eticket session initialized');
      startSessionRefresher();
      
      // Run first cycle after session is ready
      runWorkerCycle().catch((error) => {
        logger.error('scheduler.start', 'Initial scheduler cycle failed', { message: error.message });
      });

      // Set up periodic cycles
      setInterval(() => {
        runWorkerCycle().catch((error) => {
          logger.error('scheduler.cycle', 'Scheduler cycle failed', { message: error.message });
        });
      }, intervalMs);
    })
    .catch((error) => {
      logger.error('scheduler.start', 'Failed to initialize eticket session', { message: error.message });
    });
}

module.exports = {
  startScheduler,
  getCheckIntervalMs,
  runWorkerCycle
};
