require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
  try {
    const res = await client
      .from('notifications')
      .select('id, monitoring_request_id, monitoring_request:monitoring_request_id(id, user_id)')
      .limit(1);
    console.log('res', JSON.stringify(res, null, 2));
  } catch (err) {
    console.error('error', err.message);
  }
})();
