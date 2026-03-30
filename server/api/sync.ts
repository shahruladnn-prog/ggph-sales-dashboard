import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabase } from '../lib/supabase.js';
import { syncLoyverseData } from '../lib/loyverse.js';
import { syncEzeeData } from '../lib/ezee.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // 1. Auth check
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized invocation' });
  }

  try {
    const { data: branches, error } = await supabase
      .from('branches')
      .select('*, last_sync_at') // Get the last success timestamp
      .eq('is_active', true);

    if (error || !branches) throw new Error("Branch fetch failed");

    // 2. Parallelize Sync (Don't wait for one to finish before starting the next)
    const syncPromises = branches.map(async (branch) => {
      const results: Record<string, any> = { branch: branch.name, pos: 'N/A', pms: 'N/A', error: null };
      
      // Use the branch's individual last_sync or fallback to 24h
      const lookbackDate = branch.last_sync_at || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      try {
        if (branch.loyverse_auth_key && branch.loyverse_auth_key !== '') {
          await syncLoyverseData({
             apiKey: branch.loyverse_auth_key,
             storeId: branch.loyverse_store_id,
             companyId: branch.company_id,
             branchId: branch.id,
             sinceDate: lookbackDate
          });
          results.pos = 'SUCCESS';
        }

        if (branch.ezee_auth_key && branch.ezee_auth_key !== '' && branch.ezee_hotel_code) {
          const ezeeSummary = await syncEzeeData({
             authCode: branch.ezee_auth_key,
             hotelCode: branch.ezee_hotel_code,
             companyId: branch.company_id,
             branchId: branch.id,
             startDate: lookbackDate,
             endDate: new Date().toISOString(),
          });
          results.pms = `SUCCESS (rev:${ezeeSummary.scannedRevenue} rec:${ezeeSummary.scannedReceipts} synced_rev:${ezeeSummary.syncedRevenue} synced_rec:${ezeeSummary.syncedReceipts})`;
        } else if (branch.ezee_auth_key && !branch.ezee_hotel_code) {
          results.pms = 'SKIPPED — ezee_hotel_code missing in branch config';
          console.warn(`[Sync] Branch ${branch.name} has ezee_auth_key but no ezee_hotel_code.`);
        }
        
        // Update the branch heartbeat on success
        await supabase.from('branches').update({ last_sync_at: new Date().toISOString() }).eq('id', branch.id);
        
      } catch (e: any) {
        results.error = e.message;
      }
      return results;
    });

    const summary = await Promise.allSettled(syncPromises);
    return res.status(200).json({ status: 'Batch Sync Complete', summary });

  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}
