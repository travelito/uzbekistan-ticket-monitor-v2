const logger = require('../utils/logger');
const { getSession } = require('./session');

const TRAIN_LIST_URL = 'https://eticket.railway.uz/api/v3/handbook/trains/list';
const HTTP_TIMEOUT_MS = 10000;

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

async function fetchTrainList({ date, depStationCode, arvStationCode, timeoutMs = 15000 }) {
  const session = getSession();
  const payload = buildTrainListPayload({ date, depStationCode, arvStationCode });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.min(timeoutMs, HTTP_TIMEOUT_MS));

  try {
    logger.info('eticket.client', 'Sending train list request', {
      date,
      depStationCode,
      arvStationCode
    });

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
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('Train list request timed out');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = {
  fetchTrainList
};
