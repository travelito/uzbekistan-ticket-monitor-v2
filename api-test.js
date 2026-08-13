require("dotenv").config();

const url = "https://eticket.railway.uz/api/v3/handbook/trains/list";

const body = {
  directions: {
    forward: {
      date: "2026-09-08",
      depStationCode: "2900000",
      arvStationCode: "2900800"
    }
  }
};

async function main() {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Accept": "application/json",
      "Content-Type": "application/json",
      "Authorization": `Bearer ${process.env.RAILWAY_TOKEN}`,
      "device-type": "BROWSER"
    },
    body: JSON.stringify(body)
  });

  console.log("Status:", response.status);

  const text = await response.text();

  try {
    console.log(JSON.stringify(JSON.parse(text), null, 2));
  } catch {
    console.log(text);
  }
}

main().catch(console.error);

