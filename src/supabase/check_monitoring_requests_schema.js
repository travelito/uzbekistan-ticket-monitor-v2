require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const candidateColumns = [
  'id',
  'origin_station_id',
  'destination_station_id',
  'travel_date',
  'passengers',
  'status',
  'notes',
  'depart_window_start',
  'depart_window_end',
  'dep_station_code',
  'arv_station_code',
  'created_at',
  'updated_at'
];

async function checkColumn(column) {
  const { data, error, status } = await client
    .from('monitoring_requests')
    .select(column)
    .limit(1);

  return {
    column,
    status,
    exists: !error,
    error: error ? error.message : null
  };
}

(async () => {
  const results = [];
  for (const column of candidateColumns) {
    results.push(await checkColumn(column));
  }
  console.log(JSON.stringify(results, null, 2));
})();
