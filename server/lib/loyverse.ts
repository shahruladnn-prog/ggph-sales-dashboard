import axios, { AxiosError } from 'axios';
import { supabase } from './supabase.js';

const LOYVERSE_BASE_URL = 'https://api.loyverse.com/v1.0';

interface SyncConfig {
  apiKey: string;
  storeId: string | null; 
  companyId: string;
  branchId: string;
  sinceDate: string; // ISO 8601 string
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function syncLoyverseData({ apiKey, storeId, companyId, branchId, sinceDate }: SyncConfig) {
  let receipts: any[] = [];
  let fetchedCount = 0;
  let pageLimit = 250; 
  let cursor = null;
  let hasMore = true;

  console.log(`[Loyverse Sync] Starting fetch for Branch ${branchId} since ${sinceDate}`);

  while (hasMore) {
    let url = `${LOYVERSE_BASE_URL}/receipts?created_at_min=${encodeURIComponent(sinceDate)}&limit=${pageLimit}`;
    if (cursor) url += `&cursor=${encodeURIComponent(cursor)}`;

    try {
      const response = await axios.get(url, {
        headers: { Authorization: `Bearer ${apiKey}` }
      });

      let batch = response.data.receipts || [];
      
      // If storeId is provided, we filter the batch since API key might cover multiple physical stores
      if (storeId) {
         batch = batch.filter((r: any) => r.store_id === storeId);
      }
      
      receipts = receipts.concat(batch);
      fetchedCount += batch.length;

      cursor = response.data.cursor; 
      if (!cursor || batch.length < pageLimit) {
        hasMore = false;
      }
    } catch (error: any) {
       if (error.response?.status === 429) {
          console.warn(`[Loyverse] Rate limit hit on pagination. Backing off 5s...`);
          await sleep(5000);
          continue; 
       }
       throw error;
    }
  }

  if (receipts.length === 0) {
    console.log(`[Loyverse Sync] No new receipts for Branch ${branchId}.`);
    return { status: 'success', scanned: fetchedCount, synced: 0 };
  }

  // Normalize JSON Data to the Pro-Grade Unified Revenue Schema
  const unifiedPayloads = receipts.map((r: any) => {
    const paymentMethod = r.payments?.length > 0 ? r.payments[0].name : 'Unknown';
    let category = 'F&B/Retail';
    
    // Pro-Tip: Dynamic Category mapping from the first line item
    if (r.line_items && r.line_items.length > 0 && r.line_items[0].category_name) {
       category = r.line_items[0].category_name;
    }

    const grossAmount = r.total_money || 0;

    return {
      company_id: companyId,
      branch_id: branchId,
      source: 'LOYVERSE',
      source_transaction_id: `loyverse_${r.receipt_number}`, 
      transaction_date: r.created_at, 
      gross_amount: grossAmount,
      net_amount: r.net_money || grossAmount,
      tax_total: r.total_tax || 0,
      base_amount: grossAmount, // Assuming Loyverse acts in local currency setup (MYR)
      currency: 'MYR',
      category: category, 
      payment_method: paymentMethod, 
      raw_payload: r, 
      status: 'SYNCED',
      created_by: null 
    };
  });

  const { data, error } = await supabase
    .from('unified_revenue')
    .upsert(unifiedPayloads, { onConflict: 'source_transaction_id' });

  if (error) {
    console.error(`[Loyverse Sync] Database Upsert Failed:`, error);
    throw new Error(`DB Error: ${error.message}`);
  }

  console.log(`[Loyverse Sync] Completed Branch ${branchId}. Syced ${unifiedPayloads.length} records.`);
  return { status: 'success', scanned: fetchedCount, synced: unifiedPayloads.length };
}
