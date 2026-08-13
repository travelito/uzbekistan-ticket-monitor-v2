require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
  const { data, error, status } = await client
    .from('stations')
    .select('id, code, name')
    .limit(10);

  console.log('status', status);
  if (error) console.error('error', error);
  console.log(JSON.stringify(data, null, 2));
})();
