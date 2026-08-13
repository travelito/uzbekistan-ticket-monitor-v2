const { refreshSession } = require('./session');
const { fetchTrainList } = require('./client');

(async () => {
  try {
    await refreshSession();
    const result = await fetchTrainList({
      date: '2026-09-08',
      depStationCode: '2900000',
      arvStationCode: '2900800'
    });
    console.log('CLIENT OK', JSON.stringify(result?.data?.directions?.forward?.trains?.slice(0, 3), null, 2));
  } catch (error) {
    console.error('CLIENT TEST FAILED', error.message);
    process.exit(1);
  }
})();
