(async () => {
  try {
    const res = await fetch('https://eticket.railway.uz/ru/home', {
      method: 'GET',
      redirect: 'manual'
    });
    console.log('STATUS', res.status);
    const setCookie = res.headers.get('set-cookie');
    console.log('SET-COOKIE', setCookie);
    console.log('HEADERS');
    for (const [key, value] of res.headers.entries()) {
      console.log(`${key}: ${value}`);
    }
    const body = await res.text();
    console.log('BODY_LENGTH', body.length);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
