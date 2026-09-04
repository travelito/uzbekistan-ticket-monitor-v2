const logger = require('../utils/logger');
const { getSupabaseClient } = require('./supabaseClient');

function normalizeTrainNumber(value) {
  return String(value || '').trim().toUpperCase();
}

async function getTrainRoutesByNumbers(trainNumbers = []) {
  const client = getSupabaseClient();
  if (!client) {
    return {};
  }

  const normalizedNumbers = [
    ...new Set((trainNumbers || []).map(normalizeTrainNumber).filter(Boolean))
  ];

  if (normalizedNumbers.length === 0) {
    return {};
  }

  const { data, error } = await client
    .from('train_routes')
    .select('train_number, route_stations, bidirectional')
    .in('train_number', normalizedNumbers);

  if (error) {
    if (error.message && error.message.includes("Could not find the table 'public.train_routes'")) {
      logger.warn('supabase.train_routes', 'train_routes table is missing; falling back to strict route matching');
      return {};
    }

    logger.error('supabase.train_routes', 'Failed to fetch train routes', {
      error: error.message,
      trainNumbers: normalizedNumbers
    });
    return {};
  }

  return Object.fromEntries(
    (data || []).map((row) => [
      normalizeTrainNumber(row.train_number),
      {
        route_stations: Array.isArray(row.route_stations) ? row.route_stations : [],
        bidirectional: row.bidirectional !== false
      }
    ])
  );
}

module.exports = {
  getTrainRoutesByNumbers
};
