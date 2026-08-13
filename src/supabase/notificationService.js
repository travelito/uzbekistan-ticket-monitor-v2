const { getSupabaseClient } = require('../services/supabaseClient');
const {
  buildNotificationPayload: buildPayloadFromDetector,
  shouldNotify: shouldNotifyFromDetector
} = require('../services/availabilityDetector');
const logger = require('../utils/logger');

async function getLastNotificationForRequest(requestId) {
  const client = getSupabaseClient();
  if (!client) {
    logger.warn('supabase.notification', 'Supabase client unavailable, skipping getLastNotificationForRequest');
    return null;
  }

  const { data, error } = await client
    .from('notifications')
    .select('id, message, sent_at')
    .eq('monitoring_request_id', requestId)
    .order('sent_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    logger.error('supabase.notification', 'Failed to fetch last notification', {
      error: error.message,
      requestId
    });
    return null;
  }

  return data;
}

async function saveNotification({ requestId, message, notificationType = 'availability_alert', telegramMessageId = null }) {
  const client = getSupabaseClient();
  if (!client) {
    logger.warn('supabase.notification', 'Supabase client unavailable, skipping saveNotification');
    return null;
  }

  const record = {
    monitoring_request_id: requestId,
    notification_type: notificationType,
    message,
    telegram_message_id: telegramMessageId,
    sent_at: new Date().toISOString()
  };

  const { data, error } = await client.from('notifications').insert(record).select().single();
  if (error) {
    logger.error('supabase.notification', 'Failed to store notification record', {
      error: error.message,
      requestId,
      notificationType,
      telegramMessageId
    });
    return null;
  }

  logger.info('supabase.notification', 'Saved notification record', {
    notificationId: data?.id,
    requestId
  });
  return data;
}

async function getPendingNotifications() {
  const client = getSupabaseClient();
  if (!client) {
    logger.warn('supabase.notification', 'Supabase client unavailable, skipping getPendingNotifications');
    return [];
  }

  const { data, error } = await client
    .from('notifications')
    .select('*')
    .is('telegram_message_id', null)
    .order('sent_at', { ascending: true });

  if (error) {
    logger.error('supabase.notification', 'Failed to fetch pending notifications', {
      error: error.message
    });
    return [];
  }

  return Array.isArray(data) ? data : [];
}

async function markNotificationDelivered(notificationId, telegramMessageId) {
  const client = getSupabaseClient();
  if (!client) {
    logger.warn('supabase.notification', 'Supabase client unavailable, skipping markNotificationDelivered');
    return null;
  }

  const { data, error } = await client
    .from('notifications')
    .update({ telegram_message_id: telegramMessageId })
    .eq('id', notificationId)
    .select()
    .single();

  if (error) {
    logger.error('supabase.notification', 'Failed to mark notification delivered', {
      error: error.message,
      notificationId,
      telegramMessageId
    });
    return null;
  }

  return data;
}

function buildNotificationPayload(request, matchingTrains) {
  return buildPayloadFromDetector(request, matchingTrains);
}

function shouldNotify(currentPayload, lastPayload) {
  return shouldNotifyFromDetector(currentPayload, lastPayload);
}

function shouldNotifyForTrainUpdate(request, matchingTrains, lastPayload) {
  const payload = buildPayloadFromDetector(request, matchingTrains);
  return shouldNotifyFromDetector(payload, lastPayload);
}

module.exports = {
  getLastNotificationForRequest,
  saveNotification,
  buildNotificationPayload,
  shouldNotify,
  shouldNotifyForTrainUpdate
};
