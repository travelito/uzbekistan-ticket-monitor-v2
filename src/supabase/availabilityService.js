const { getSupabaseClient } = require('../services/supabaseClient');
const logger = require('../utils/logger');

async function saveAvailabilityCheck({
  requestId,
  searchMeta = null,
  rawResponse = null,
  normalizedTrains = [],
  available = false,
  availableSeats = null,
  errorMessage = null
}) {
  const client = getSupabaseClient();
  if (!client) {
    logger.warn('supabase.availability', 'Supabase client unavailable, skipping saveAvailabilityCheck');
    return null;
  }

  const payload = {
    monitoring_request_id: requestId,
    checked_at: new Date().toISOString(),
    success: !errorMessage,
    available,
    available_seats: availableSeats,
    response_data: {
      searchMeta,
      normalizedTrains,
      rawResponse
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
  saveAvailabilityCheck
};
