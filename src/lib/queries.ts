import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { ensureUserSetup } from "@/lib/setup";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

export interface AppContext {
  /** RLS client (owner) or service-role client (read-only viewer). */
  supabase: SupabaseClient<Database>;
  /** The owner's identity. In viewer mode this is the resolved owner. */
  user: { id: string; email: string | null };
  /** True for unauthenticated "view only" visitors - no mutations allowed. */
  readOnly: boolean;
}

// Backwards-compatible alias for the previous return type name.
export type UserContext = AppContext;

// The app has a single owner. Resolve their id once (from the lone settings row)
// and cache it for the process - used to scope read-only viewer queries.
let cachedOwnerId: string | null = null;
async function resolveOwnerId(svc: SupabaseClient<Database>): Promise<string | null> {
  if (cachedOwnerId) return cachedOwnerId;
  const { data } = await svc.from("settings").select("user_id").limit(1).maybeSingle();
  cachedOwnerId = data?.user_id ?? null;
  return cachedOwnerId;
}

/**
 * Resolve the request's data context:
 *   - Signed-in owner  -> RLS client, full access (readOnly: false)
 *   - Anyone else      -> service-role client scoped to the owner, read-only
 *   - No owner yet      -> null
 * Mutations are never possible in read-only mode: server actions require a real
 * session (getUser), which viewers don't have, and the service client is only
 * ever used for SELECTs here.
 */
export async function getContext(): Promise<AppContext | null> {
  const rls = await createClient();
  const {
    data: { user },
  } = await rls.auth.getUser();

  if (user) {
    return { supabase: rls, user: { id: user.id, email: user.email ?? null }, readOnly: false };
  }

  // Public, read-only view of the owner's live data.
  const svc = createServiceClient();
  const ownerId = await resolveOwnerId(svc);
  if (ownerId) {
    return { supabase: svc, user: { id: ownerId, email: null }, readOnly: true };
  }
  return null;
}

/**
 * Get the data context for a page, or redirect to /login if the app hasn't been
 * set up yet. Also provisions the owner's settings + default lookups (owner only;
 * never in read-only mode). Pages await this before fetching, so setup is done.
 */
export async function requireUser(): Promise<AppContext> {
  const ctx = await getContext();
  if (!ctx) redirect("/login");
  if (!ctx.readOnly) await ensureUserSetup(ctx.supabase, ctx.user.id);
  return ctx;
}
