const { createClient } = require('@supabase/supabase-js');
const config = require('../config');
const logger = require('../utils/logger');

let supabaseClient = null;

function normalizeSupabaseUrl(url) {
  if (!url || typeof url !== 'string') {
    return url;
  }

  try {
    const parsed = new URL(url);
    const host = parsed.host;
    return `${parsed.protocol}//${host}`;
  } catch (error) {
    return url.replace(/\/rest\/v1\/?$/, '').replace(/\/auth\/v1\/?$/, '');
  }
}

function parseNotes(notes) {
  if (!notes) {
    return {};
  }

  try {
    return typeof notes === 'string' ? JSON.parse(notes) : notes;
  } catch (error) {
    return {};
  }
}

function getSupabaseClient() {
  if (supabaseClient) {
    return supabaseClient;
  }

  const { supabaseUrl, supabaseServiceRoleKey } = config;
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    logger.warn('supabase.client', 'Supabase credentials are not configured. Skipping database integration.');
    return null;
  }

  const normalizedUrl = normalizeSupabaseUrl(supabaseUrl);

  supabaseClient = createClient(normalizedUrl, supabaseServiceRoleKey, {
    auth: { persistSession: false },
    global: {
      fetch
    }
  });

  logger.info('supabase.client', 'Supabase client created', {
    supabaseUrl
  });

  return supabaseClient;
}

async function testSupabaseConnection() {
  const client = getSupabaseClient();
  if (!client) {
    throw new Error('Supabase client is not configured');
  }

  const { error } = await client.from('stations').select('id').limit(1);
  if (error) {
    throw new Error(`Supabase connectivity check failed: ${error.message}`);
  }

  return true;
}

async function findStationsByTerm(term) {
  const client = getSupabaseClient();
  if (!client) {
    logger.warn('supabase.station', 'Supabase client unavailable, cannot search stations');
    return [];
  }

  const searchTerm = `%${String(term).trim()}%`;
  const { data, error } = await client
    .from('stations')
    .select('*')
    .or(`name.ilike.${searchTerm},code.ilike.${searchTerm}`)
    .limit(10);

  if (error) {
    logger.error('supabase.station', 'Failed to search stations', { error: error.message, term });
    return [];
  }

  return Array.isArray(data) ? data : [];
}

async function getMonitoringRequestsForChat(chatId) {
  const client = getSupabaseClient();
  if (!client) {
    logger.warn('supabase.monitoring', 'Supabase client unavailable, cannot fetch monitoring requests');
    return [];
  }

  const { data, error } = await client
    .from('monitoring_requests')
    .select('*')
    .eq('user_id', String(chatId))
    .order('created_at', { ascending: false });

  if (error) {
    logger.error('supabase.monitoring', 'Failed to fetch monitoring requests', { error: error.message, chatId });
    return [];
  }

  return Array.isArray(data) ? data : [];
}

async function getActiveMonitoringRequests() {
  const client = getSupabaseClient();
  if (!client) {
    logger.warn('supabase.monitoring', 'Supabase client unavailable, cannot fetch active monitoring requests');
    return [];
  }

  const { data, error } = await client
    .from('monitoring_requests')
    .select('*')
    .eq('status', 'active')
    .order('created_at', { ascending: true });

  if (error) {
    logger.error('supabase.monitoring', 'Failed to fetch active monitoring requests', { error: error.message });
    return [];
  }

  const requests = Array.isArray(data) ? data : [];
  const stationIds = [
    ...new Set(
      requests.flatMap((req) => [req.origin_station_id, req.destination_station_id]).filter(Boolean)
    )
  ];

  let stationNamesById = {};
  if (stationIds.length > 0) {
    const { data: stations, error: stationsError } = await client
      .from('stations')
      .select('id, name')
      .in('id', stationIds);

    if (stationsError) {
      logger.error('supabase.monitoring', 'Failed to fetch station names for active requests', {
        error: stationsError.message
      });
    } else {
      stationNamesById = Object.fromEntries((stations || []).map((station) => [station.id, station.name]));
    }
  }

  return requests.map((req) => {
    // Enrich with parsed notes
    const parsed = parseNotes(req.notes);
    return {
      ...req,
      dep_station_code: parsed.depStationCode || null,
      arv_station_code: parsed.arvStationCode || null,
      dep_station_name: stationNamesById[req.origin_station_id] || null,
      arv_station_name: stationNamesById[req.destination_station_id] || null,
      user_id: req.user_id || parsed.userId || parsed.chatId || null,
      chat_id: req.chat_id || parsed.chatId || parsed.userId || null,
      train_types: parsed.trainTypes || null,
      depart_window_start: parsed.departWindowStart || null,
      depart_window_end: parsed.departWindowEnd || null
    };
  });
}

module.exports = {
  getSupabaseClient,
  testSupabaseConnection,
  findStationsByTerm,
  getMonitoringRequestsForChat,
  getActiveMonitoringRequests
};
