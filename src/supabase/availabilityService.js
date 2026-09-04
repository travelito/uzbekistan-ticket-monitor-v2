const { getSupabaseClient } = require('../services/supabaseClient');
const { buildMatchingTrainsSignature } = require('../services/availabilityDetector');
const logger = require('../utils/logger');

const HEARTBEAT_INTERVAL_MS = 24 * 60 * 60 * 1000;

function parseResponseData(responseData) {
  if (!responseData) {
    return {};
  }

  try {
    return typeof responseData === 'string' ? JSON.parse(responseData) : responseData;
  } catch (error) {
    return {};
  }
}

function isHeartbeatDue(checkedAt, now) {
  const lastCheckedAt = new Date(checkedAt).getTime();
  return Number.isNaN(lastCheckedAt) || now.getTime() - lastCheckedAt >= HEARTBEAT_INTERVAL_MS;
}

function shouldSaveAvailabilityCheck(current, latestCheck, now = new Date()) {
  if (!latestCheck || !current.success) {
    return true;
  }

  if (isHeartbeatDue(latestCheck.checked_at, now)) {
    return true;
  }

  if (
    latestCheck.success !== current.success ||
    latestCheck.available !== current.available ||
    latestCheck.available_seats !== current.availableSeats
  ) {
    return true;
  }

  const lastSignature = parseResponseData(latestCheck.response_data).matchingTrainsSignature;
  if (!lastSignature) {
    return true;
  }

  return JSON.stringify(lastSignature) !== JSON.stringify(current.matchingTrainsSignature);
}

async function saveAvailabilityCheck({
  requestId,
  searchMeta = null,
  normalizedTrains = [],
  matchingTrains = [],
  available = false,
  availableSeats = null,
  errorMessage = null
}) {
  const client = getSupabaseClient();
  if (!client) {
    logger.warn('supabase.availability', 'Supabase client unavailable, skipping saveAvailabilityCheck');
    return null;
  }

  const success = !errorMessage;
  const matchingTrainsSignature = buildMatchingTrainsSignature({ matchingTrains });
  const { data: latestCheck, error: latestCheckError } = await client
    .from('availability_checks')
    .select('checked_at, success, available, available_seats, response_data')
    .eq('monitoring_request_id', requestId)
    .order('checked_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestCheckError) {
    logger.error('supabase.availability', 'Failed to fetch latest availability check', {
      error: latestCheckError.message,
      requestId
    });
    throw latestCheckError;
  }

  if (!shouldSaveAvailabilityCheck({
    success,
    available,
    availableSeats,
    matchingTrainsSignature
  }, latestCheck)) {
    logger.info('supabase.availability', 'Availability check unchanged; skipping insert', { requestId });
    return null;
  }

  const payload = {
    monitoring_request_id: requestId,
    checked_at: new Date().toISOString(),
    success,
    available,
    available_seats: availableSeats,
    response_data: {
      searchMeta,
      normalizedTrains,
      matchingTrainsSignature
    },
    error_message: errorMessage
  };

  const { data, error } = await client.from('availability_checks').insert(payload).select().single();
  if (error) {
    logger.error('supabase.availability', 'Failed to insert availability check', {
      error: error.message,
      requestId
    });
    throw error;
  }

  logger.info('supabase.availability', 'Saved availability check', {
    availabilityCheckId: data?.id,
    requestId
  });
  return data;
}

module.exports = {
  saveAvailabilityCheck,
  shouldSaveAvailabilityCheck
};
