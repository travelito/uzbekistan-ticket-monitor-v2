require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
  const { data, error, status } = await client
    .from('pg_table_def')
    .select('column, type, foreign_table, is_nullable')
    .eq('table', 'notifications');

  console.log('status', status);
  console.log('error', error);
  console.log(JSON.stringify(data, null, 2));
})();
