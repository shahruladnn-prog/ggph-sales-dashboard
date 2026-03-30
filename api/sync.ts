/**
 * api/sync.ts — Vercel Serverless Function (Root Level)
 * Auto-detected by Vercel at /api/sync
 * Triggers a full sync of all active branches (Loyverse + eZee PMS).
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import axios from 'axios';

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

// ─── Utilities ────────────────────────────────────────────
function chunkDateRange(start: string, end: string, chunkDays = 30) {
  const chunks: { start: string; end: string }[] = [];
  let current = new Date(start);
  const endDate = new Date(end);
  while (current < endDate) {
    const chunkEnd = new Date(current);
    chunkEnd.setDate(chunkEnd.getDate() + chunkDays);
    chunks.push({
      start: current.toISOString(),
      end: (chunkEnd < endDate ? chunkEnd : endDate).toISOString(),
    });
    current = new Date(chunkEnd);
  }
  return chunks;
}

// ─── eZee Sync ────────────────────────────────────────────
async function syncEzee(branch: any, startDate: string, endDate: string) {
  const EZEE_URL = 'https://live.ipms247.com/index.php/page/service.PMSAccountAPI';
  let syncedRevenue = 0;
  const chunks = chunkDateRange(startDate, endDate, 30);

  for (const chunk of chunks) {
    const payload = {
      requestfor: 'XERO_GET_TRANSACTION_DATA',
      HotelCode: branch.ezee_hotel_code,
      authcode: branch.ezee_auth_key,
      fromdate: chunk.start.split('T')[0].split('-').reverse().join('-'),
      todate: chunk.end.split('T')[0].split('-').reverse().join('-'),
      ischeckout: 'true',
      language: 'en',
    };

    const res = await axios.post(EZEE_URL, payload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 60000,
    });

    const records = res.data?.XERO_GET_TRANSACTION_DATA;
    if (!Array.isArray(records)) continue;

    const rows = records
      .filter((r: any) => parseFloat(r.total_amount || '0') > 0)
      .map((r: any) => ({
        company_id: branch.company_id,
        branch_id: branch.id,
        source: 'EZEE',
        source_transaction_id: `ezee_${r.record_id}`,
        transaction_date: r.reference2 || r.record_date,
        gross_amount: parseFloat(r.total_amount || '0'),
        net_amount: parseFloat(r.total_amount || '0') - parseFloat(r.tax_amount || '0'),
        tax_total: parseFloat(r.tax_amount || '0'),
        base_amount: parseFloat(r.total_amount || '0'),
        category: 'Rooms',
        raw_payload: r,
      }));

    if (rows.length > 0) {
      const { error } = await supabase.from('unified_revenue').upsert(rows, {
        onConflict: 'source_transaction_id',
        ignoreDuplicates: false,
      });
      if (!error) syncedRevenue += rows.length;
    }
  }
  return syncedRevenue;
}

// ─── Loyverse Sync ────────────────────────────────────────
async function syncLoyverse(branch: any, sinceDate: string) {
  const LOYVERSE_URL = 'https://api.loyverse.com/v1.0/receipts';
  let allReceipts: any[] = [];
  let cursor: string | null = null;

  do {
    const params: any = {
      updated_at_min: sinceDate,
      limit: 250,
    };
    if (branch.loyverse_store_id) params.store_id = branch.loyverse_store_id;
    if (cursor) params.cursor = cursor;

    const res = await axios.get(LOYVERSE_URL, {
      headers: { Authorization: `Bearer ${branch.loyverse_auth_key}` },
      params,
      timeout: 30000,
    });

    const receipts = res.data?.receipts || [];
    allReceipts = allReceipts.concat(receipts);
    cursor = res.data?.cursor || null;
  } while (cursor);

  if (allReceipts.length === 0) return 0;

  const rows = allReceipts.map((r: any) => ({
    company_id: branch.company_id,
    branch_id: branch.id,
    source: 'LOYVERSE',
    source_transaction_id: `loyverse_${r.receipt_number}`,
    transaction_date: r.receipt_date,
    gross_amount: parseFloat(r.total_money || '0'),
    net_amount: parseFloat(r.net_total_money || r.total_money || '0'),
    tax_total: parseFloat(r.total_tax || '0'),
    base_amount: parseFloat(r.total_money || '0'),
    category: r.line_items?.[0]?.item_name || 'POS Sale',
    raw_payload: r,
  }));

  const { error } = await supabase.from('unified_revenue').upsert(rows, {
    onConflict: 'source_transaction_id',
    ignoreDuplicates: false,
  });

  return error ? 0 : rows.length;
}

// ─── Handler ──────────────────────────────────────────────
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Allow both GET (from button) and POST (from cron)
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Auth check - skip if called from the dashboard with the sync secret
  const authHeader = req.headers.authorization;
  const syncSecret = process.env.CRON_SECRET || '';
  if (syncSecret && authHeader !== `Bearer ${syncSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const { data: branches, error } = await supabase
      .from('branches')
      .select('*')
      .eq('is_active', true);

    if (error || !branches) throw new Error('Branch fetch failed');

    const endDate = new Date().toISOString();
    const results: any[] = [];

    for (const branch of branches) {
      const startDate = branch.last_sync_at
        ? new Date(branch.last_sync_at).toISOString()
        : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

      const branchResult: any = { branch: branch.name, pos: 'N/A', pms: 'N/A' };

      if (branch.loyverse_auth_key) {
        try {
          branchResult.pos = await syncLoyverse(branch, startDate);
        } catch (e: any) {
          branchResult.pos = `ERROR: ${e.message}`;
        }
      }

      if (branch.ezee_auth_key && branch.ezee_hotel_code) {
        try {
          branchResult.pms = await syncEzee(branch, startDate, endDate);
        } catch (e: any) {
          branchResult.pms = `ERROR: ${e.message}`;
        }
      }

      await supabase
        .from('branches')
        .update({ last_sync_at: endDate })
        .eq('id', branch.id);

      results.push(branchResult);
    }

    return res.status(200).json({ status: 'Sync Complete', results });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}
