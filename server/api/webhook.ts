import crypto from 'crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabase } from '../lib/supabase.js';

// The "Live Ticker" Webhook Ingestion
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // 1. HMRC Security Validation
  const signature = req.headers['x-loyverse-signature'];
  const webhookSecret = process.env.LOYVERSE_WEBHOOK_SECRET;

  if (!signature || !webhookSecret) {
    return res.status(401).json({ error: 'Missing HMAC signature or webhook secret.' });
  }

  const payload = JSON.stringify(req.body);
  const hash = crypto.createHmac('sha256', webhookSecret).update(payload).digest('base64');

  if (hash !== signature) {
    console.warn(`[Webhook] Invalid Signature attempt. Ignoring payload.`);
    return res.status(403).json({ error: 'Invalid HMAC signature' });
  }

  // 2. Process Live Payload (Real-time Upsert)
  const receipt = req.body;
  if (!receipt || !receipt.receipt_number) {
    return res.status(400).json({ error: 'Invalid payload structure' });
  }

  try {
    // Dynamically find the branch mapped to this physical store
    const { data: branchData, error } = await supabase
      .from('branches')
      .select('id, company_id')
      .eq('loyverse_store_id', receipt.store_id)
      .limit(1)
      .single();

    if (error || !branchData) {
      console.warn(`[Webhook] Receipt ${receipt.receipt_number} pushed but store is unmapped.`);
      return res.status(200).json({ status: 'Ignored: No Branch Mapped' });
    }

    const category = (receipt.line_items?.length > 0 && receipt.line_items[0].category_name) 
       ? receipt.line_items[0].category_name 
       : 'F&B/Retail';
       
    const rawGross = receipt.total_money || 0;

    const liveEntry = {
      company_id: branchData.company_id,
      branch_id: branchData.id,
      source: 'LOYVERSE',
      source_transaction_id: `loyverse_${receipt.receipt_number}`, 
      transaction_date: receipt.created_at, 
      gross_amount: rawGross,
      net_amount: receipt.net_money || rawGross,
      tax_total: receipt.total_tax || 0,
      base_amount: rawGross, // Normalized MyR value
      currency: 'MYR',
      category: category, 
      payment_method: receipt.payments?.[0]?.name || 'Unknown',
      raw_payload: receipt, 
      status: 'SYNCED',
    };

    // The core idempotent protection remains completely identical to standard cron logic
    const { error: upsertError } = await supabase
      .from('unified_revenue')
      .upsert(liveEntry, { onConflict: 'source_transaction_id' });

    if (upsertError) throw upsertError;

    return res.status(200).json({ status: 'Live Upsert Complete' });
  } catch (err: any) {
    console.error(`[Webhook] Live Sync Error:`, err);
    return res.status(500).json({ error: 'Internal Live Sync Fault' });
  }
}
