(async () => {
  try {
    const homeUrl = 'https://eticket.railway.uz/ru/home';
    const csrfUrl = 'https://eticket.railway.uz/api/v1/csrf-token';

    console.log('=== GET /ru/home ===');
    const homeRes = await fetch(homeUrl, {
      method: 'GET',
      redirect: 'manual'
    });
    console.log('HOME STATUS', homeRes.status);
    console.log('HOME SET-COOKIE', homeRes.headers.get('set-cookie') || 'none');
    console.log('HOME COOKIES', homeRes.headers.get('cookie') || 'none');
    console.log('HOME CONTENT-TYPE', homeRes.headers.get('content-type'));
    const homeBody = await homeRes.text();
    console.log('HOME BODY LEN', homeBody.length);

    console.log('\n=== GET /api/v1/csrf-token ===');
    const csrfRes = await fetch(csrfUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Referer': 'https://eticket.railway.uz/ru/home',
        'Origin': 'https://eticket.railway.uz'
      },
      redirect: 'manual'
    });
    console.log('CSRF STATUS', csrfRes.status);
    console.log('CSRF SET-COOKIE', csrfRes.headers.get('set-cookie') || 'none');
    console.log('CSRF BODY LEN', (await csrfRes.text()).length);
  } catch (err) {
    console.error('ERROR', err.message);
    process.exit(1);
  }
})();
