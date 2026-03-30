import { syncEzeeData } from './lib/ezee.js';

const BRANCH_ID   = 'f64bc29a-5224-47d4-88db-a9ce951f27bd';
const COMPANY_ID  = 'a137b450-9b07-482a-8e48-4af258487650';
const HOTEL_CODE  = '18130';
const AUTH_KEY    = '33194760454c4556cb-e609-11f0-9';

// Month to Date (March 1 to March 31, 2026)
const startDate = '2026-03-01T00:00:00.000Z';
const endDate   = '2026-03-31T23:59:59.000Z';

async function run() {
  console.log('🚀 Starting MTD eZee sync test...');
  try {
    const result = await syncEzeeData({
      authCode: AUTH_KEY,
      hotelCode: HOTEL_CODE,
      companyId: COMPANY_ID,
      branchId: BRANCH_ID,
      startDate,
      endDate,
    });
    console.log('\n✅ Sync complete!');
    console.log(`   Revenue records scanned : ${result.scannedRevenue}`);
    console.log(`   Receipt records scanned : ${result.scannedReceipts}`);
    console.log(`   Total revenue upserted  : ${result.syncedRevenue}`);
    console.log(`   Total receipt upserted  : ${result.syncedReceipts}`);
  } catch (err: any) {
    console.error('\n❌ Sync failed:', err.message);
  }
}

run();
