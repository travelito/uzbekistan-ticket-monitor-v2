require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
  try {
    const all = await client.from('notifications').select('notification_type').limit(100);
    console.log('status', all.status);
    console.log('error', JSON.stringify(all.error, null, 2));
    console.log('data', JSON.stringify(all.data, null, 2));

    const distinct = await client.from('notifications').select('notification_type').neq('notification_type', null).limit(100);
    console.log('distinct status', distinct.status);
    console.log('distinct error', JSON.stringify(distinct.error, null, 2));
    console.log('distinct data', JSON.stringify(distinct.data, null, 2));
  } catch (err) {
    console.error('script error', err.message);
  }
})();
