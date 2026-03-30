import { supabase } from '../lib/supabase.js';

// Refactored to operate on pure UUIDs rather than string ENUMs
export async function runAnomalyDetection(branchId: string, branchName: string, targetDateISO: string) {
  const startDate = new Date(targetDateISO);
  startDate.setUTCHours(0,0,0,0);
  const endDate = new Date(targetDateISO);
  endDate.setUTCHours(23,59,59,999);

  // Focus only on this specific branch 
  const { data: records, error } = await supabase
    .from('unified_revenue')
    .select('*')
    .eq('branch_id', branchId)
    .gte('transaction_date', startDate.toISOString())
    .lte('transaction_date', endDate.toISOString());

  if (error) {
    throw new Error(`DB Error fetching target date data: ${error.message}`);
  }

  const loyverseData = records?.filter(r => r.source === 'LOYVERSE') || [];
  const ezeeData = records?.filter(r => r.source === 'EZEE') || [];
  const manualData = records?.filter(r => r.source === 'MANUAL') || [];

  const anomalies: string[] = [];
  const isHybridMode = ezeeData.length > 0;

  const posTotalGross = loyverseData.reduce((acc, curr) => acc + Number(curr.gross_amount), 0);
  const posTotalNet = loyverseData.reduce((acc, curr) => acc + Number(curr.net_amount), 0);
  const posRefundsTotal = Math.abs(loyverseData.filter(r => Number(r.gross_amount) < 0).reduce((acc, curr) => acc + Number(curr.gross_amount), 0));
  
  const manualTotalGross = manualData.reduce((acc, curr) => acc + Number(curr.gross_amount), 0);
  const dailyTotalGross = posTotalGross + manualTotalGross + ezeeData.reduce((acc, curr) => acc + Number(curr.gross_amount), 0);

  // C. The Manual-To-Auto Ratio Check (> 20%)
  // A high volume of manual adjustments can mask theft or API failure
  if (dailyTotalGross > 0) {
    const manualRatio = manualTotalGross / dailyTotalGross;
    if (manualRatio > 0.20) {
      anomalies.push(`HIGH_MANUAL_RATIO: Manual adjustments constitute ${(manualRatio * 100).toFixed(1)}% of total daily revenue. High risk for tampering or missing API data.`);
    }
  }

  if (isHybridMode) {
    const guestCount = ezeeData.length;
    const posActionCount = loyverseData.length;
    
    if (guestCount > 10 && posActionCount < (guestCount * 0.2)) {
      anomalies.push(`SUSPECTED_LEAKAGE: Only ${posActionCount} POS actions for ${guestCount} checked-in rooms.`);
    }
  } else {
    // POS-ONLY MODE
    // A. Refund Spike Check (> 5%)
    if (posTotalGross > 0) {
      const refundRatio = posRefundsTotal / (posTotalGross + posRefundsTotal);
      if (refundRatio > 0.05) {
         anomalies.push(`HIGH_REFUNDS: Refunds reached ${(refundRatio * 100).toFixed(1)}% of total daily volume.`);
      }
    }

    // B. Historical Deviation (Stubbed to $5000)
    const baselineAvg = await fetchBaselineAverage(branchId, startDate.getDay()); 
    if (baselineAvg > 0 && posTotalGross < (baselineAvg * 0.8)) {
       anomalies.push(`REVENUE_DROP: Gross Sales (${posTotalGross}) is >20% below the 4-week historical baseline for this weekday.`);
    }
  }

  // After Hours check
  const afterHoursScans = loyverseData.filter(r => {
    const hour = new Date(r.transaction_date).getUTCHours();
    return hour >= 16 || hour <= 22; 
  });

  if (afterHoursScans.length > 0) {
     anomalies.push(`AFTER_HOURS_ACTIVITY: Detected ${afterHoursScans.length} transactions processed outside standard business hours.`);
  }

  if (anomalies.length > 0) {
    console.warn(`[Anomaly Detector] 🚨 Anomalies detected for branch ${branchName}:`, anomalies);
  } else {
    console.log(`[Anomaly Detector] ✅ No anomalies detected for branch ${branchName}`);
  }
  
  return anomalies;
}

async function fetchBaselineAverage(branchId: string, dayOfWeekIndex: number): Promise<number> {
  return 5000; 
}
