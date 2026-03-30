/**
 * backfill-ezee.ts — One-time historical backfill
 * Syncs eZee data from Jan 1, 2026 to today for Gopeng Glamping Park
 */
import { syncEzeeData } from './lib/ezee.js';
import 'dotenv/config';

const BRANCH_ID   = 'f64bc29a-5224-47d4-88db-a9ce951f27bd';
const COMPANY_ID  = 'a137b450-9b07-482a-8e48-4af258487650';
const HOTEL_CODE  = '18130';
const AUTH_KEY    = '33194760454c4556cb-e609-11f0-9';

const startDate = '2026-01-01T00:00:00.000Z';
const endDate   = new Date().toISOString();

async function run() {
  console.log('🚀 Starting HISTORICAL eZee backfill...');
  console.log(`📅 Range: ${startDate} → ${endDate}`);
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

    console.log('\n✅ Backfill complete!');
    console.log(`   Revenue records scanned : ${result.scannedRevenue}`);
    console.log(`   Revenue records synced  : ${result.syncedRevenue}`);
    console.log(`   Receipt records scanned : ${result.scannedReceipts}`);
    console.log(`   Receipt records synced  : ${result.syncedReceipts}`);
  } catch (err: any) {
    console.error('\n❌ Backfill failed:', err.message);
    process.exit(1);
  }
}

run();
