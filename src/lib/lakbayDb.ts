import { createClient } from "@supabase/supabase-js";

/** Public read-only client. Database RLS hides unapproved records. */
export function lakbayPublicDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Lakbay Supabase public environment variables are not configured");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
