/**
 * test-ezee-sync.ts
 * Runs the NEW syncEzeeData() against the live Gopeng Glamping Park branch
 * and writes results to Supabase unified_revenue table.
 * 
 * Usage: npx tsx test-ezee-sync.ts
 */
import { syncEzeeData } from './lib/ezee.js';

const BRANCH_ID   = 'f64bc29a-5224-47d4-88db-a9ce951f27bd';
const COMPANY_ID  = 'a137b450-9b07-482a-8e48-4af258487650';
const HOTEL_CODE  = '18130';
const AUTH_KEY    = '33194760454c4556cb-e609-11f0-9';

// Sync the last 7 days of data
const endDate   = new Date().toISOString();
const startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

async function run() {
  console.log('🚀 Starting targeted eZee sync test...');
  console.log(`📅 Date range: ${startDate} → ${endDate}`);
  console.log(`🏨 Hotel: ${HOTEL_CODE} | Branch: ${BRANCH_ID}\n`);

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
    process.exit(1);
  }
}

run();
