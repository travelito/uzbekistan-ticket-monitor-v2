const logger = require('../utils/logger');
const { getSession } = require('./session');

const TRAIN_LIST_URL = 'https://eticket.railway.uz/api/v3/handbook/trains/list';
const HTTP_TIMEOUT_MS = 10000;
const MAX_RATE_LIMIT_RETRIES = 4;
const RATE_LIMIT_BASE_DELAY_MS = 2000;
const RATE_LIMIT_MAX_DELAY_MS = 30000;

function buildTrainListPayload({ date, depStationCode, arvStationCode }) {
  return {
    directions: {
      forward: {
        date,
        depStationCode,
        arvStationCode
      }
    }
  };
}

function isRateLimited(response) {
  return response.status === 429 || response.status === 503;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function performRequest({ date, depStationCode, arvStationCode, timeoutMs }) {
  const session = getSession();
  const payload = buildTrainListPayload({ date, depStationCode, arvStationCode });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.min(timeoutMs, HTTP_TIMEOUT_MS));

  try {
    const response = await fetch(TRAIN_LIST_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'device-type': 'BROWSER',
        'x-xsrf-token': session.xsrfToken,
        Cookie: session.cookie
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    return response;
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('Train list request timed out');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchTrainList({ date, depStationCode, arvStationCode, timeoutMs = 15000 }) {
  logger.info('eticket.client', 'Sending train list request', {
    date,
    depStationCode,
    arvStationCode
  });

  let attempt = 0;
  for (;;) {
    const response = await performRequest({ date, depStationCode, arvStationCode, timeoutMs });

    if (isRateLimited(response)) {
      attempt += 1;
      if (attempt > MAX_RATE_LIMIT_RETRIES) {
        logger.error('eticket.client', 'Rate limited by eticket.railway.uz - giving up after max retries', {
          date,
          depStationCode,
          arvStationCode,
          httpStatus: response.status,
          attempt
        });
        throw new Error(`Train list request failed: rate limited (HTTP ${response.status}) after ${attempt} attempts`);
      }

      const delayMs = Math.min(RATE_LIMIT_BASE_DELAY_MS * 2 ** (attempt - 1), RATE_LIMIT_MAX_DELAY_MS);
      logger.warn('eticket.client', 'Received 429/503 from eticket.railway.uz - possible rate limiting, backing off', {
        date,
        depStationCode,
        arvStationCode,
        httpStatus: response.status,
        attempt,
        delayMs
      });
      await sleep(delayMs);
      continue;
    }

    const text = await response.text();
    let data;
    try {
      data = text ? JSON.parse(text) : null;
    } catch (parseError) {
      throw new Error(`Failed to parse train list response: ${parseError.message}`);
    }

    if (!response.ok) {
      const errorMessage = data?.message || `HTTP ${response.status}`;
      throw new Error(`Train list request failed: ${errorMessage}`);
    }

    logger.info('eticket.client', 'Received train list response', {
      trainCount: Array.isArray(data?.data?.directions?.forward?.trains) ? data.data.directions.forward.trains.length : undefined
    });

    return data;
  }
}

module.exports = {
  fetchTrainList
};
