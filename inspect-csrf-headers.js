(async () => {
  try {
    const url = 'https://eticket.railway.uz/api/v1/csrf-token';
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Referer: 'https://eticket.railway.uz/ru/home',
        Origin: 'https://eticket.railway.uz'
      }
    });
    console.log('status', res.status);
    const keys = [...res.headers.keys()];
    console.log('keys', keys);
    console.log('set-cookie', res.headers.get('set-cookie'));
    console.log('raw', JSON.stringify(res.headers.raw(), null, 2));
    const body = await res.text();
    console.log('body len', body.length);
    console.log('body', body);
  } catch (err) {
    console.error('error', err.message);
  }
})();
