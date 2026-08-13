const cookieHeader = 'XSRF-TOKEN=aef9ba9a-73be-42c1-8f8b-6afd45849142; _ga=GA1.1.1333484545.1786469052; __stripe_mid=e7b80c3a-f13a-4bae-9dfb-b377a99e73ef43af53; __stripe_sid=e0e6a7bc-8f5e-4ac9-9cea-6d0fdd2f0ed86b8fc6; _ga_R5LGX7P1YR=GS2.1.s1786469052$o1$g1$t1786472698$j60$l0$h0; _ga_T44B6TRXBL=GS2.1.s1786469052$o1$g1$t1786472699$j59$l0$h0';
const xsrfToken = 'aef9ba9a-73be-42c1-8f8b-6afd45849142';
const url = 'https://eticket.railway.uz/api/v3/handbook/trains/list';
const body = {
  directions: {
    forward: {
      date: '2026-09-08',
      depStationCode: '2900000',
      arvStationCode: '2900800'
    }
  }
};
const attempts = [0, 5 * 60 * 1000, 15 * 60 * 1000, 30 * 60 * 1000];
const names = ['immediate', '5min', '15min', '30min'];
async function doAttempt(name) {
  const ts = new Date().toISOString();
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'device-type': 'BROWSER',
        'x-xsrf-token': xsrfToken,
        Cookie: cookieHeader
      },
      body: JSON.stringify(body)
    });
    const text = await res.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch (err) {
      json = null;
    }
    console.log(`ATTEMPT ${name} ${ts} STATUS ${res.status} OK ${res.ok}`);
    if (json) {
      const trainCount = json?.data?.directions?.forward?.trains?.length ?? 'unknown';
      const firstCars = json?.data?.directions?.forward?.trains?.[0]?.cars;
      console.log(`  trains=${trainCount} firstCars=${Array.isArray(firstCars) ? firstCars.length : 'none'}`);
    } else {
      console.log(`  body=${text.slice(0, 500).replace(/\n/g, '')}`);
    }
  } catch (err) {
    console.log(`ATTEMPT ${name} ${ts} ERROR`, err.message);
  }
}
(async () => {
  for (let i = 0; i < attempts.length; i++) {
    const delay = attempts[i];
    if (delay > 0) {
      console.log(`Waiting ${delay / 1000 / 60} minutes until attempt ${names[i]}`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
    await doAttempt(names[i]);
  }
  console.log('ALL_ATTEMPTS_DONE', new Date().toISOString());
})();
