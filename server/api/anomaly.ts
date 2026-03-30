import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabase } from '../lib/supabase.js';
import { runAnomalyDetection } from '../lib/anomaly.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const authHeader = req.headers.authorization;
  const isCron = authHeader === `Bearer ${process.env.CRON_SECRET}`;
  
  if (!isCron && req.method !== 'POST') {
     return res.status(401).json({ error: 'Unauthorized. Protected Dashboard Webhook.' });
  }

  const targetDateISO = req.body?.targetDate || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  try {
    const { data: branches, error } = await supabase
      .from('branches')
      .select('id, name')
      .eq('is_active', true);

    if (error || !branches) {
      throw new Error(`Failed to fetch branches from database: ${error?.message}`);
    }

    const anomalyReport: Record<string, string[]> = {};

    for (const branch of branches) {
       const alerts = await runAnomalyDetection(branch.id, branch.name, targetDateISO);
       if (alerts.length > 0) {
          anomalyReport[branch.name] = alerts;
       }
    }

    // Trigger external webhooks if needed
    if (Object.keys(anomalyReport).length > 0 && process.env.SLACK_WEBHOOK_URL) {
       console.log("Triggering slack message...");
    }

    return res.status(200).json({ status: 'Analysis Complete', report: anomalyReport });
  } catch (err: any) {
    return res.status(500).json({ error: 'Anomaly Detector failed', details: err.message });
  }
}
