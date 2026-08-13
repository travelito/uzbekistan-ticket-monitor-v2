require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const candidates = [
  'id',
  'monitoring_request_id',
  'notification_type',
  'message',
  'sent_at',
  'telegram_message_id',
  'is_read',
  'delivered_at',
  'read_at',
  'created_at',
  'updated_at',
  'payload'
];

(async () => {
  for (const col of candidates) {
    try {
      const res = await client.from('notifications').select(col).limit(0);
      console.log(col, res.status, res.error ? res.error.message : 'OK');
    } catch (err) {
      console.log(col, 'EXCEPTION', err.message);
    }
  }
})();
