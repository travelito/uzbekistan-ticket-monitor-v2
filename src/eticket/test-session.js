const { refreshSession, getSession } = require('./session');

(async () => {
  try {
    const session = await refreshSession();
    console.log('SESSION OK', session);

    const current = getSession();
    console.log('GET SESSION OK', current);
  } catch (error) {
    console.error('SESSION TEST FAILED', error.message);
    process.exit(1);
  }
})();
