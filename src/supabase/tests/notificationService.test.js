const { createMonitoringRequest } = require('../monitoringService');
const { getLastNotificationForRequest, saveNotification } = require('../notificationService');

function isSupabaseConfigured() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

async function run() {
  if (!isSupabaseConfigured()) {
    console.warn('Supabase environment is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to run this test.');
    process.exit(0);
  }

  try {
    const created = await createMonitoringRequest({
      userId: 'test-chat-3',
      originStationId: '4e0139a2-4d6f-4012-bce8-613fd11d1adc',
      destinationStationId: '7179b114-9549-4957-93f2-048437f4092e',
      date: '2026-09-08',
      passengers: 1,
      trainTypes: ['Sharq'],
      departWindowStart: '08:00',
      departWindowEnd: '14:00'
    });
    const saved = await saveNotification({
      requestId: created.id,
      notificationType: 'availability_alert',
      message: 'Test notification'
    });
    console.log('saved', saved);

    const last = await getLastNotificationForRequest(created.id);
    console.log('last', last);
  } catch (error) {
    console.error('TEST FAILED', error.message || error);
    process.exit(1);
  }
}

run();
