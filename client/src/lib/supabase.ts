import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase URL or Anon key is missing from environment variables.');
}

// Client-side Supabase instance. RLS policies protect data querying based on auth context.
export const supabase = createClient(supabaseUrl, supabaseAnonKey);
