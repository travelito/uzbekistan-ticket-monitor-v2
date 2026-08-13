const { testSupabaseConnection } = require('../services/supabaseClient');
const { fetchTrainList } = require('../services/railwayApi');
const logger = require('../utils/logger');
const config = require('../config');

async function runHealthCheck() {
  logger.info('healthcheck.start', 'Running health check for all integrations');

  const results = {
    railway: false,
    supabase: false
  };

  try {
    await fetchTrainList({
      date: config.defaultRoute.date,
      depStationCode: config.defaultRoute.depStationCode,
      arvStationCode: config.defaultRoute.arvStationCode,
      timeoutMs: 10000
    });
    results.railway = true;
    logger.info('healthcheck.railway', 'Railway API connection verified');
  } catch (error) {
    logger.error('healthcheck.railway', 'Railway API health check failed', {
      message: error.message
    });
  }

  try {
    await testSupabaseConnection();
    results.supabase = true;
    logger.info('healthcheck.supabase', 'Supabase connection verified');
  } catch (error) {
    logger.error('healthcheck.supabase', 'Supabase health check failed', {
      message: error.message
    });
  }

  return results;
}

if (require.main === module) {
  runHealthCheck().then((results) => {
    console.log('Health check results:', JSON.stringify(results, null, 2));
    if (!results.railway || !results.supabase) {
      process.exitCode = 1;
    }
  });
}

module.exports = {
  runHealthCheck
};
