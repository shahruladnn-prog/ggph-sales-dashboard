import axios from 'axios';
import fs from 'fs/promises';

const EZEE_HOTEL_CODE = '18130';
const EZEE_AUTH_KEY = '33194760454c4556cb-e609-11f0-9';

async function probe() {
  const url = 'https://live.ipms247.com/index.php/page/service.PMSAccountAPI';

  const basePayload = {
    auth_code: EZEE_AUTH_KEY,
    hotel_code: EZEE_HOTEL_CODE,
    fromdate: '2026-03-25',
    todate: '2026-03-30',
  };

  // 1. Retrieve Revenues
  try {
    console.log("📡 Hitting Retrieve Revenues (XERO_GET_TRANSACTION_DATA)...");
    const payload = { ...basePayload, requestfor: "XERO_GET_TRANSACTION_DATA", ischeckout: "true" };
    const res = await axios.post(url, payload, { headers: { 'Content-Type': 'application/json' } });
    await fs.writeFile('ezee-revenues.json', JSON.stringify(res.data, null, 2));
    console.log("✅ Wrote ezee-revenues.json");
  } catch (err: any) {
    console.log("❌ ERROR:", err.response?.data || err.message);
  }

  // 2. Retrieve Receipts
  try {
    console.log("\n📡 Hitting Retrieve Receipts (XERO_GET_RECEIPT_DATA)...");
    const payload = { ...basePayload, requestfor: "XERO_GET_RECEIPT_DATA" };
    const res = await axios.post(url, payload, { headers: { 'Content-Type': 'application/json' } });
    await fs.writeFile('ezee-receipts.json', JSON.stringify(res.data, null, 2));
    console.log("✅ Wrote ezee-receipts.json");
  } catch (err: any) {
    console.log("❌ ERROR:", err.response?.data || err.message);
  }
}

probe();
