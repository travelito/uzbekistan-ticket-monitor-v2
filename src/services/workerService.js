const logger = require('../utils/logger');
const { getActiveMonitoringRequests } = require('./supabaseClient');
const { fetchTrainList } = require('./railwayApi');
const { parseTrainList } = require('./availabilityParser');
const { findMatchingTrains, buildNotificationPayload, shouldNotify } = require('./availabilityDetector');
const { getLastNotificationForRequest, saveNotification } = require('./notificationService');
const { saveAvailabilityCheck } = require('./monitoringService');
const { sendMessage } = require('./telegramBot');
const config = require('../config');

async function processMonitoringRequest(request) {
  if (!request) {
    return null;
  }

  const searchParams = {
    date: request.travel_date,
    depStationCode: request.dep_station_code,
    arvStationCode: request.arv_station_code
  };

  const response = await fetchTrainList(searchParams);
  const normalized = parseTrainList(response);
  await saveAvailabilityCheck({
    requestId: request.id,
    searchMeta: searchParams,
    rawResponse: response,
    normalizedTrains: normalized
  });

  const matchingTrains = findMatchingTrains(normalized, request);
  if (matchingTrains.length === 0) {
    logger.info('worker.request', 'No matching trains found for request', {
      requestId: request.id
    });
    return null;
  }

  const payload = buildNotificationPayload(request, matchingTrains);
  const lastNotification = await getLastNotificationForRequest(request.id);
  if (!shouldNotify(payload, lastNotification?.payload)) {
    logger.info('worker.request', 'Matching trains found but notification already sent', {
      requestId: request.id
    });
    return null;
  }

  const message = buildMonitoringNotificationMessage(request, matchingTrains);
  const telegramResult = await sendMessage(request.user_id, message);
  await saveNotification({
    requestId: request.id,
    notificationType: 'availability_alert',
    message,
    telegramMessageId: telegramResult?.message_id || null
  });

  return payload;
}

function buildMonitoringNotificationMessage(request, matchingTrains) {
  const lines = matchingTrains.map((train) => {
    const carLines = train.cars.map((car) => `- ${car.type}: ${car.availableSeats}`).join('\n');
    return `*Поезд ${train.trainNumber} (${train.trainType})*\n${train.origin} → ${train.destination}\nОтправление: ${train.departure}\nПрибытие: ${train.arrival}\n${carLines}`;
  });

  return `Найдены доступные билеты для мониторинга *${request.id}*:\n\n${lines.join('\n\n')}`;
}

async function runWorkerCycle() {
  logger.info('worker.cycle', 'Starting monitoring worker cycle', { intervalMinutes: config.checkIntervalMinutes });
  const requests = await getActiveMonitoringRequests();
  for (const request of requests) {
    try {
      await processMonitoringRequest(request);
    } catch (error) {
      logger.error('worker.request', 'Failed to process monitoring request', {
        requestId: request?.id,
        message: error.message
      });
    }
  }
}

function startScheduler() {
  const intervalMs = Math.max(1, config.checkIntervalMinutes) * 60 * 1000;
  logger.info('worker.scheduler', 'Starting scheduler', { intervalMs });
  runWorkerCycle().catch((error) => {
    logger.error('worker.scheduler', 'Initial worker cycle failed', { message: error.message });
  });

  setInterval(() => {
    runWorkerCycle().catch((error) => {
      logger.error('worker.scheduler', 'Worker cycle failed', { message: error.message });
    });
  }, intervalMs);
}

module.exports = {
  runWorkerCycle,
  startScheduler
};
