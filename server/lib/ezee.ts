import axios from 'axios';
import { supabase } from './supabase.js';

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

const EZEE_API_URL = 'https://live.ipms247.com/index.php/page/service.PMSAccountAPI';
const EZEE_ROOM_INFO_URL = 'https://live.ipms247.com/pmsinterface/pms_connectivity.php';

/** eZee returns all data for a date range in a single response (no server-side pagination).
 *  However, large ranges produce huge payloads — we chunk into 31-day windows to stay safe. */
const MAX_DAYS_PER_CHUNK = 31;

/** Max retries on network error or HTTP 5xx */
const MAX_RETRIES = 3;

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface EzeeConfig {
  authCode: string;
  hotelCode: string;
  companyId: string;
  branchId: string;
  startDate: string;  // ISO 8601 e.g. "2026-03-01T00:00:00.000Z"
  endDate?: string;   // Optional. Defaults to now if omitted.
}

interface EzeeRevenueRecord {
  record_id: string;
  record_date: string;
  reference1: string;   // checkin date
  reference2: string;   // checkout date
  reference3: string;   // reservation no
  reference4: string;   // folio no
  reference5: string;   // guest name
  reference7: string;   // business source name
  reference13: string;  // room no
  reference14: string;  // room type name
  reference15: string;  // rate plan name
  reference30: string;  // booking channel: "WEB" | "PMS" | "OTA"
  detail: EzeeDetailLine[];
  total_amount: string | number;
  amount_paid: string | number;
  balance: string | number;
  flat_discount: string | number;
  adjustment_amount: string | number;
}

interface EzeeDetailLine {
  reference_id: number;
  reference_name: string; // "Room Revenue" | "Extra Charges" | "Taxes" | "Discount"
  amount: string | number;
  charge_name: string;
  taxper: string;
  qty: number;
}

interface EzeeReceiptGroup {
  type: string;  // "Advance Deposit" | "Received From Guest" | "Received From Cityledger"
  data: EzeeReceiptRecord[];
}

interface EzeeReceiptRecord {
  tranId: string;
  tran_datetime: string;
  reference2: string;   // guest name / CL name
  reference3?: string;  // reservation no (optional — not always present)
  reference14: string;  // payment method (e.g. "eGHL", "Cash")
  gross_amount: string | number;
  remark: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Safely parse a numeric string to a rounded 2dp float */
function toFloat(value: string | number | null | undefined, fallback = 0): number {
  const parsed = parseFloat(String(value ?? '0'));
  if (isNaN(parsed)) return fallback;
  return Math.round(parsed * 100) / 100;
}

/** Format a JS Date to yyyy-mm-dd for eZee API params */
function toEzeeDate(date: Date): string {
  return date.toISOString().split('T')[0] ?? '';
}

/**
 * Split a date range into ≤31-day chunks.
 * eZee returns everything in one shot but large payloads time out.
 */
function buildDateChunks(startDate: string, endDate: string): Array<{ from: string; to: string }> {
  const chunks: Array<{ from: string; to: string }> = [];
  let current = new Date(startDate);
  const end = new Date(endDate);

  while (current < end) {
    const chunkEnd = new Date(current);
    chunkEnd.setDate(chunkEnd.getDate() + MAX_DAYS_PER_CHUNK);

    chunks.push({
      from: toEzeeDate(current),
      to: toEzeeDate(chunkEnd > end ? end : chunkEnd),
    });

    current = new Date(chunkEnd > end ? end : chunkEnd);
    current.setDate(current.getDate() + 1);
  }

  return chunks;
}

/**
 * POST to the eZee API with retry logic.
 * Handles string-based eZee error codes (not standard HTTP 4xx).
 */
async function ezeePost(payload: Record<string, string>, attempt = 1): Promise<any> {
  try {
    const response = await axios.post(EZEE_API_URL, payload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 60000, // 60s — large date ranges can be slow
    });

    const data = response.data;

    // eZee returns string error codes inside the response body (not HTTP status codes)
    // Check common fatal auth errors early and throw clearly.
    if (typeof data === 'string') {
      // Some eZee errors return plain strings like "AuthKey" or "AllFields"
      const knownErrors: Record<string, string> = {
        AuthKey: 'eZee Auth: Authentication Key Not Found. Check hotel_code + auth_code.',
        AllFields: 'eZee Auth: All fields are mandatory. Check request payload.',
        HotelCode: 'eZee Auth: Hotel Code Not Found.',
        ReqFor: 'eZee Request: Invalid Request Format (requestfor).',
        '304': 'eZee DB: Database Error (304).',
        '202': 'eZee Auth: Unauthorized — hotel code not active.',
        '301': 'eZee Auth: Unauthorized — request not valid for this hotel code.',
        '303': 'eZee Auth: Auth Code is inactive.',
      };
      const msg = knownErrors[data.trim()] ?? `eZee returned unknown string: "${data}"`;
      throw new Error(msg);
    }

    return data;
  } catch (error: any) {
    // Network errors or HTTP 5xx: retry with exponential backoff
    if (attempt < MAX_RETRIES && (!error.response || error.response.status >= 500)) {
      const backoff = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
      console.warn(`[eZee] Attempt ${attempt} failed. Retrying in ${backoff / 1000}s... Error: ${error.message}`);
      await sleep(backoff);
      return ezeePost(payload, attempt + 1);
    }
    throw error;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// REVENUE PARSER
// Extracts room revenue, extra charges, taxes and discounts from detail[].
// The top-level gross_amount is ALWAYS 0 in this API — use total_amount.
// ─────────────────────────────────────────────────────────────────────────────

function parseRevenueRecord(r: EzeeRevenueRecord, companyId: string, branchId: string) {
  const details = Array.isArray(r.detail) ? r.detail : [];

  let roomRevenue = 0;
  let extraCharges = 0;
  let taxTotal = 0;
  let discountTotal = 0;

  for (const line of details) {
    const amount = toFloat(line.amount);
    switch (line.reference_name) {
      case 'Room Revenue':
        roomRevenue += amount;
        break;
      case 'Extra Charges':
        extraCharges += amount;
        break;
      case 'Taxes':
        taxTotal += amount;
        break;
      case 'Discount':
        discountTotal += amount;
        break;
      // Ignore: 'Adjustment', 'Payment Type', etc. — not revenue lines
    }
  }

  const totalAmount = toFloat(r.total_amount);     // gross billed (incl. tax)
  const amountPaid  = toFloat(r.amount_paid);
  const balance     = toFloat(r.balance);          // already rounded via toFloat

  // Net revenue = room + extras excluding tax
  const netAmount = Math.round((roomRevenue + extraCharges - discountTotal) * 100) / 100;

  // Booking channel: reference30 is "WEB", "PMS", or "OTA"
  const bookingChannel = (r.reference30 || 'PMS').toUpperCase();

  return {
    company_id: companyId,
    branch_id: branchId,
    source: 'EZEE' as const,
    source_transaction_id: `ezee_${r.record_id}`,
    transaction_date: `${r.record_date}T00:00:00+08:00`,  // assume MYT (UTC+8)
    gross_amount: totalAmount,
    net_amount: netAmount,
    tax_total: taxTotal,
    base_amount: totalAmount,  // MYR-only property
    currency: 'MYR',
    category: 'Room Rate',
    payment_method: amountPaid > 0 && balance <= 0 ? 'Paid-In-Full' : 'Partial/Pending',
    reason_code: bookingChannel,   // "WEB" | "PMS" | "OTA"
    reference_note: [
      `Guest: ${String(r.reference5 ?? '')}`,
      `Room: ${String(r.reference13 ?? '')} (${String(r.reference14 ?? '')})`,
      `Plan: ${String(r.reference15 ?? '')}`,
      `CI: ${String(r.reference1 ?? '')} CO: ${String(r.reference2 ?? '')}`,
      `Res#: ${String(r.reference3 ?? '')} Folio#: ${String(r.reference4 ?? '')}`,
    ].join(' | '),
    raw_payload: r,
    status: 'SYNCED' as const,
    created_by: null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// RECEIPT PARSER
// Receipts (payments received) are stored separately — unique ID format: "receipt_R{tranId}"
// This allows reconciliation against revenue records.
// ─────────────────────────────────────────────────────────────────────────────

function parseReceiptRecord(
  record: EzeeReceiptRecord,
  type: string,
  companyId: string,
  branchId: string
) {
  const amount = toFloat(record.gross_amount);

  // Resolve payment method from reference14 (e.g. "eGHL", "Cash", "Voucher - Travel Fair")
  const paymentMethod = record.reference14 || type || 'Unknown';

  // Maps to payment_receipts table — NOT unified_revenue
  return {
    company_id: companyId,
    branch_id: branchId,
    source: 'EZEE',
    source_receipt_id: `ezee_receipt_${record.tranId}`,
    receipt_type: type,                      // "Advance Deposit" | "Received From Guest" | etc.
    payment_method: paymentMethod,           // "eGHL" | "Cash" | "Voucher - Travel Fair"
    amount,
    currency: 'MYR',
    transaction_date: `${record.tran_datetime}T00:00:00+08:00`,
    guest_name: record.reference2 || null,
    reservation_no: record.reference3 || null,
    remark: record.remark || null,
    raw_payload: record,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN SYNC FUNCTION
// ─────────────────────────────────────────────────────────────────────────────

export async function syncEzeeData({
  authCode,
  hotelCode,
  companyId,
  branchId,
  startDate,
  endDate,
}: EzeeConfig): Promise<{ status: string; scannedRevenue: number; scannedReceipts: number; syncedRevenue: number; syncedReceipts: number }> {

  // ── 1. Input validation ───────────────────────────────────────────────────
  if (!authCode || !hotelCode) {
    throw new Error('[eZee Sync] authCode and hotelCode are required.');
  }
  if (!startDate) {
    throw new Error('[eZee Sync] startDate is required.');
  }

  const resolvedEnd = endDate ?? new Date().toISOString();
  const chunks = buildDateChunks(startDate, resolvedEnd);

  console.log(`[eZee Sync] Branch ${branchId} | Hotel ${hotelCode} | ${chunks.length} date chunk(s): ${startDate} → ${resolvedEnd}`);

  const allRevenuePayloads: ReturnType<typeof parseRevenueRecord>[] = [];
  const allReceiptPayloads: ReturnType<typeof parseReceiptRecord>[] = [];

  let scannedRevenue = 0;
  let scannedReceipts = 0;

  // ── 2. Fetch across date chunks ───────────────────────────────────────────
  for (const chunk of chunks) {
    console.log(`[eZee Sync]   → Chunk: ${chunk.from} → ${chunk.to}`);

    const basePayload = {
      auth_code: authCode,
      hotel_code: hotelCode,
      fromdate: chunk.from,
      todate: chunk.to,
    };

    // ── 2a. Revenue (Checkout transactions) ─────────────────────────────────
    try {
      const revenueData = await ezeePost({
        ...basePayload,
        requestfor: 'XERO_GET_TRANSACTION_DATA',
        ischeckout: 'true',  // MUST BE STRING — not boolean
      });

      const records: EzeeRevenueRecord[] = Array.isArray(revenueData) ? revenueData : [];
      scannedRevenue += records.length;

      for (const record of records) {
        // Skip records with zero total — likely system artifacts
        if (toFloat(record.total_amount) === 0) {
          console.warn(`[eZee Sync] Skipping zero-amount revenue record: ${record.record_id}`);
          continue;
        }
        allRevenuePayloads.push(parseRevenueRecord(record, companyId, branchId));
      }

      console.log(`[eZee Sync]   ✓ Revenue: ${records.length} records in chunk`);
    } catch (err: any) {
      // Log but continue — don't abort the entire sync for one chunk
      console.error(`[eZee Sync] ❌ Revenue fetch failed for ${chunk.from}→${chunk.to}: ${err.message}`);
    }

    // ── 2b. Receipts (Inward payments) ──────────────────────────────────────
    try {
      const receiptData = await ezeePost({
        ...basePayload,
        requestfor: 'XERO_GET_RECEIPT_DATA',
      });

      // Receipt response is wrapped: { status: "Success", data: [ { type, data: [] }, ... ] }
      if (receiptData?.status === 'Success' && Array.isArray(receiptData.data)) {
        for (const group of receiptData.data as EzeeReceiptGroup[]) {
          const records = Array.isArray(group.data) ? group.data : [];
          scannedReceipts += records.length;

          for (const record of records) {
            if (toFloat(record.gross_amount) === 0) {
              console.warn(`[eZee Sync] Skipping zero-amount receipt: ${record.tranId}`);
              continue;
            }
            allReceiptPayloads.push(parseReceiptRecord(record, group.type, companyId, branchId));
          }
        }
        console.log(`[eZee Sync]   ✓ Receipts: ${scannedReceipts} records in chunk`);
      } else {
        // Could be an auth error string or empty result
        console.warn(`[eZee Sync]   ⚠ Receipts: Unexpected response format`, receiptData);
      }
    } catch (err: any) {
      console.error(`[eZee Sync] ❌ Receipt fetch failed for ${chunk.from}→${chunk.to}: ${err.message}`);
    }

    // Small polite delay between chunks to avoid hammering the eZee server
    if (chunks.length > 1) {
      await sleep(500);
    }
  }

  // ── 3. Upsert Revenue → unified_revenue ──────────────────────────────────
  const BATCH_SIZE = 500;
  let syncedRevenue = 0;
  let syncedReceipts = 0;

  if (allRevenuePayloads.length === 0 && allReceiptPayloads.length === 0) {
    console.log(`[eZee Sync] No records to sync for Branch ${branchId}.`);
    return { status: 'success', scannedRevenue, scannedReceipts, syncedRevenue: 0, syncedReceipts: 0 };
  }

  for (let i = 0; i < allRevenuePayloads.length; i += BATCH_SIZE) {
    const batch = allRevenuePayloads.slice(i, i + BATCH_SIZE);

    const { error } = await supabase
      .from('unified_revenue')
      .upsert(batch, { onConflict: 'source_transaction_id' });

    if (error) {
      console.error(`[eZee Sync] ❌ unified_revenue upsert failed (batch ${Math.floor(i / BATCH_SIZE) + 1}):`, error.message);
      throw new Error(`[eZee Sync] DB Error (revenue): ${error.message}`);
    }

    syncedRevenue += batch.length;
    console.log(`[eZee Sync]   ✓ Revenue batch ${Math.floor(i / BATCH_SIZE) + 1}: ${batch.length} rows → unified_revenue`);
  }

  // ── 4. Upsert Receipts → payment_receipts ────────────────────────────────
  for (let i = 0; i < allReceiptPayloads.length; i += BATCH_SIZE) {
    const batch = allReceiptPayloads.slice(i, i + BATCH_SIZE);

    const { error } = await supabase
      .from('payment_receipts')
      .upsert(batch, { onConflict: 'source_receipt_id' });

    if (error) {
      console.error(`[eZee Sync] ❌ payment_receipts upsert failed (batch ${Math.floor(i / BATCH_SIZE) + 1}):`, error.message);
      throw new Error(`[eZee Sync] DB Error (receipts): ${error.message}`);
    }

    syncedReceipts += batch.length;
    console.log(`[eZee Sync]   ✓ Receipt batch ${Math.floor(i / BATCH_SIZE) + 1}: ${batch.length} rows → payment_receipts`);
  }

  console.log(
    `[eZee Sync] ✅ Done for Branch ${branchId}. ` +
    `Revenue: ${scannedRevenue} scanned → ${syncedRevenue} upserted | ` +
    `Receipts: ${scannedReceipts} scanned → ${syncedReceipts} upserted`
  );

  return {
    status: 'success',
    scannedRevenue,
    scannedReceipts,
    syncedRevenue,
    syncedReceipts,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// ROOM INFO — Run once during onboarding, cache in DB if needed
// Returns room types + rate types for data enrichment / display labels
// ─────────────────────────────────────────────────────────────────────────────

export async function fetchEzeeRoomInfo(authCode: string, hotelCode: string) {
  try {
    const response = await axios.post(
      EZEE_ROOM_INFO_URL,
      {
        RES_Request: {
          Request_Type: 'RoomInfo',
          NeedPhysicalRooms: 1,
          Authentication: {
            HotelCode: hotelCode,
            AuthCode: authCode,
          },
        },
      },
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 30000,
      }
    );

    const body = response.data;
    const errorCode = body?.Errors?.ErrorCode;

    if (errorCode && errorCode !== '0') {
      throw new Error(`eZee RoomInfo error ${errorCode}: ${body?.Errors?.ErrorMessage}`);
    }

    return {
      roomTypes: body?.RoomInfo?.RoomTypes?.RoomType ?? [],
      rateTypes: body?.RoomInfo?.RateTypes?.RateType ?? [],
      ratePlans: body?.RoomInfo?.RatePlans?.RatePlan ?? [],
    };
  } catch (err: any) {
    console.error('[eZee RoomInfo] Failed:', err.message);
    throw err;
  }
}
