const { railwayApiUrl, railwayToken } = require('../config');
const logger = require('../utils/logger');

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
  if (!railwayToken) {
    throw new Error('Missing Railway API token. Set RAILWAY_TOKEN in environment variables.');
  }

  const payload = buildTrainListPayload({ date, depStationCode, arvStationCode });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    logger.info('railway.request', 'Sending request to Railway API', {
      url: railwayApiUrl,
      date,
      depStationCode,
      arvStationCode
    });

    const response = await fetch(railwayApiUrl, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${railwayToken}`,
        'device-type': 'BROWSER'
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    const text = await response.text();
    let data;

    try {
      data = text ? JSON.parse(text) : null;
    } catch (parseError) {
      throw new Error(`Failed to parse Railway API response: ${parseError.message}`);
    }

    if (!response.ok) {
      const errorMessage = data && data.message ? data.message : `HTTP ${response.status}`;
      throw new Error(`Railway API request failed: ${errorMessage}`);
    }

    logger.info('railway.response', 'Received response from Railway API', {
      status: response.status,
      trainCount: Array.isArray(data?.data?.trains ?? data?.trains) ? (data?.data?.trains ?? data?.trains).length : undefined
    });

    return data;
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('Railway API request timed out');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = {
  fetchTrainList,
  buildTrainListPayload
};
