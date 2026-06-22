import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

/**
 * Privileged, server-only Supabase client (service role key). It bypasses RLS,
 * so it is used ONLY for read-only rendering of the single owner's data to
 * unauthenticated "view only" visitors - never for writes, and never shipped to
 * the browser. Every query made through it must be scoped to the owner's user_id.
 */
export function createServiceClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
