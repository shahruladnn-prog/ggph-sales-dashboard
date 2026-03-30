import axios from 'axios';

const HOTEL_CODE  = '18130';
const AUTH_KEY    = '33194760454c4556cb-e609-11f0-9';
const EZEE_ACCOUNT_URL = 'https://live.ipms247.com/index.php/page/service.PMSAccountAPI';

async function ezeePost(payload: any) {
  const response = await axios.post(EZEE_ACCOUNT_URL, payload, {
    headers: { 'Content-Type': 'application/json' }
  });
  return response.data;
}

async function run() {
  const payload = {
    auth_code: AUTH_KEY,
    hotel_code: HOTEL_CODE,
    fromdate: '2026-03-29',
    todate: '2026-03-31',
    requestfor: 'XERO_GET_TRANSACTION_DATA',
  };
  
  try {
    const withFlagFalse = await ezeePost({...payload, ischeckout: "false"});
    const isArray = Array.isArray(withFlagFalse);
    console.log(`With ischeckout="false": ${isArray ? withFlagFalse.length : typeof withFlagFalse} records`);
    
    if (isArray && withFlagFalse.length > 0) {
        console.log(`Sample folio from ischeckout=false: ${withFlagFalse[0].reference4} Date: ${withFlagFalse[0].record_date}`);
        const guestHasNotCheckedOut = withFlagFalse.find(r => r.reference4 === "2037" || r.reference4 === "2089");
        if(guestHasNotCheckedOut) {
           console.log("SUCCESS! Found one of the missing in-house folios: " + guestHasNotCheckedOut.reference4);
        }
    } else {
        console.log(JSON.stringify(withFlagFalse).substring(0, 500));
    }
  } catch(e: any) { console.error(e.message) }
}
run();
