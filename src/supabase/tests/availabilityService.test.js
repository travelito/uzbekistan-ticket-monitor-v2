const { saveAvailabilityCheck } = require('../availabilityService');
const createTestRequest = require('./monitoring_request_helper');

function isSupabaseConfigured() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

async function run() {
  if (!isSupabaseConfigured()) {
    console.warn('Supabase environment is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to run this test.');
    process.exit(0);
  }

  try {
    const request = await createTestRequest();
    const saved = await saveAvailabilityCheck({
      requestId: request.id
    });
    console.log('saved', saved);
  } catch (error) {
    console.error('TEST FAILED', error.message || error);
    process.exit(1);
  }
}

run();
