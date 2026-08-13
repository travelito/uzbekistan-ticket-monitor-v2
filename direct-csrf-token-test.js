(async () => {
  try {
    const url = 'https://eticket.railway.uz/api/v1/csrf-token';
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Referer': 'https://eticket.railway.uz/ru/home',
        'Origin': 'https://eticket.railway.uz'
      },
      redirect: 'manual'
    });
    console.log('STATUS', res.status);
    console.log('HEADERS');
    for (const [k, v] of res.headers.entries()) {
      if (k.toLowerCase().includes('set-cookie') || k.toLowerCase().includes('content-type') || k.toLowerCase().includes('access-control')) {
        console.log(`${k}: ${v}`);
      }
    }
    const body = await res.text();
    console.log('BODY', body);
  } catch (err) {
    console.error('ERROR', err.message);
    process.exit(1);
  }
})();
