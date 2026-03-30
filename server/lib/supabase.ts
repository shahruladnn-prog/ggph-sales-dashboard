import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseUrl || !supabaseKey) {
  console.warn("⚠️ Warning: Supabase URL or Service Role Key is missing in environment variables.");
}

// Employs the Service Role Key for backend administrative bypass of RLS (Row Level Security)
// This is strictly for Data Hub operations (Cron jobs, webhooks). Never expose this client to the frontend.
export const supabase = createClient(supabaseUrl, supabaseKey);
