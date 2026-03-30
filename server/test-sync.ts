import { supabase } from './lib/supabase.js';
import { syncLoyverseData } from './lib/loyverse.js';

async function runLocalSync() {
  console.log("🚀 Starting Local Initial Sync...");

  // Get active branches mapped with credentials
  const { data: branches, error } = await supabase
    .from('branches')
    .select('*')
    .eq('is_active', true);

  if (error) {
    console.error("❌ Failed to fetch branches:", error);
    process.exit(1);
  }

  console.log(`📡 Found ${branches.length} active branches. Booting sync engines...`);

  // We loop to pull all data from the beginning of the month for "Historical Sync"
  const lookbackDate = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString(); // Start of current month

  for (const branch of branches) {
    console.log(`\n===========================================`);
    console.log(`🏦 Syncing: ${branch.name}`);
    console.log(`===========================================`);
    
    if (branch.loyverse_auth_key) {
      try {
        await syncLoyverseData({
            apiKey: branch.loyverse_auth_key,
            storeId: branch.loyverse_store_id,
            companyId: branch.company_id,
            branchId: branch.id,
            sinceDate: lookbackDate
        });
      } catch (err: any) {
         console.error(`🚨 Error syncing Loyverse for ${branch.name}:`, err.message);
      }
    } else {
        console.log(`⚠️ Skipped Loyverse - No Auth Key`);
    }

    // In the future: We add eZee PMS initial sync here
  }

  console.log(`\n✅ Local Sync Run Complete!`);
}

runLocalSync();
