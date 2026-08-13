const { getSupabaseClient } = require('../services/supabaseClient');
const logger = require('../utils/logger');

async function findStationsByTerm(term) {
  const client = getSupabaseClient();
  if (!client) {
    logger.warn('supabase.monitoring', 'Supabase client unavailable, cannot search stations');
    return [];
  }

  const searchTerm = `%${String(term).trim()}%`;
  const { data, error } = await client
    .from('stations')
    .select('id, code, name')
    .or(`name.ilike.${searchTerm},code.ilike.${searchTerm}`)
    .limit(20);

  if (error) {
    logger.error('supabase.monitoring', 'Failed to search stations', { error: error.message, term });
    return [];
  }

  return Array.isArray(data) ? data : [];
}

async function findStationById(id) {
  const client = getSupabaseClient();
  if (!client) {
    return null;
  }

  const { data, error } = await client
    .from('stations')
    .select('id, code, name')
    .eq('id', id)
    .limit(1)
    .maybeSingle();

  if (error) {
    logger.error('supabase.monitoring', 'Failed to find station by id', { error: error.message, id });
    return null;
  }

  return data || null;
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

function enrichMonitoringRequest(request) {
  const parsed = parseNotes(request.notes);
  return {
    ...request,
    user_id: request.user_id || parsed.userId || parsed.chatId || null,
    chat_id: request.chat_id || parsed.chatId || parsed.userId || null,
    dep_station_code: parsed.depStationCode || null,
    arv_station_code: parsed.arvStationCode || null,
    train_types: parsed.trainTypes || null,
    depart_window_start: parsed.departWindowStart || null,
    depart_window_end: parsed.departWindowEnd || null
  };
}

async function createMonitoringRequest({ userId, originStationId, destinationStationId, date, passengers, trainTypes, departWindowStart, departWindowEnd }) {
  const client = getSupabaseClient();
  if (!client) {
    logger.warn('supabase.monitoring', 'Supabase client unavailable, skipping createMonitoringRequest');
    return null;
  }

  const originStation = await findStationById(originStationId);
  const destinationStation = await findStationById(destinationStationId);

  if (!originStation || !destinationStation) {
    throw new Error('Unable to resolve origin or destination station ID');
  }

  const payload = {
    origin_station_id: originStation.id,
    destination_station_id: destinationStation.id,
    travel_date: date,
    passengers,
    status: 'active',
    notes: JSON.stringify({
      userId: String(userId),
      chatId: String(userId),
      originStationId,
      destinationStationId,
      originStationCode: originStation.code,
      destinationStationCode: destinationStation.code,
      trainTypes,
      departWindowStart,
      departWindowEnd
    }),
    created_at: new Date().toISOString()
  };

  const { data, error } = await client.from('monitoring_requests').insert(payload).select().single();
  if (error) {
    logger.error('supabase.monitoring', 'Failed to create monitoring request', {
      error: error.message,
      originStationId,
      destinationStationId,
      date
    });
    throw error;
  }

  logger.info('supabase.monitoring', 'Created monitoring request', {
    monitoringRequestId: data?.id
  });
  return data;
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
    .ilike('notes', `%${String(chatId)}%`)
    .order('created_at', { ascending: false });

  if (error) {
    logger.error('supabase.monitoring', 'Failed to fetch monitoring requests', { error: error.message, chatId });
    return [];
  }

  return Array.isArray(data) ? data.map(enrichMonitoringRequest) : [];
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

  return Array.isArray(data) ? data.map(enrichMonitoringRequest) : [];
}

async function getMonitoringRequestById(requestId) {
  const client = getSupabaseClient();
  if (!client) {
    logger.warn('supabase.monitoring', 'Supabase client unavailable, cannot fetch monitoring request by id');
    return null;
  }

  const { data, error } = await client
    .from('monitoring_requests')
    .select('*')
    .eq('id', requestId)
    .limit(1)
    .maybeSingle();

  if (error) {
    logger.error('supabase.monitoring', 'Failed to fetch monitoring request by id', { error: error.message, requestId });
    return null;
  }

  return data ? enrichMonitoringRequest(data) : null;
}

module.exports = {
  findStationsByTerm,
  findStationById,
  createMonitoringRequest,
  getMonitoringRequestsForChat,
  getActiveMonitoringRequests,
  getMonitoringRequestById
};
