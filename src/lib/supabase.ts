import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Vercel Supabase integration uses project-prefixed env var names
const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.NEXT_PUBLIC_minRoundtable_SUPABASE_URL ||
  process.env.SUPABASE_URL ||
  process.env.minRoundtable_SUPABASE_URL ||
  "";

const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_minRoundtable_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.minRoundtable_SUPABASE_ANON_KEY ||
  process.env.minRoundtable_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_minRoundtable_SUPABASE_PUBLISHABLE_KEY ||
  "";

function checkConfig() {
  if (!supabaseUrl || !supabaseAnonKey) {
    console.warn(
      "[Supabase] NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are not configured. " +
      "Database persistence is disabled."
    );
    return false;
  }
  return true;
}

// Client-side Supabase instance (uses anon key)
export const supabase: SupabaseClient | null = checkConfig()
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

// Server-side Supabase instance (uses service role key for admin access)
export function getServerSupabase(): SupabaseClient {
  const url = supabaseUrl;
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.minRoundtable_SUPABASE_SERVICE_ROLE_KEY ||
    process.env.minRoundtable_SUPABASE_SECRET_KEY ||
    supabaseAnonKey;
  if (!url || !serviceKey) {
    throw new Error(
      "Supabase environment variables are not configured. " +
      "Please set SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY."
    );
  }
  return createClient(url, serviceKey);
}
