import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ensureUserSetup } from "@/lib/setup";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

export interface AppContext {
  /** The owner's RLS-scoped Supabase client. */
  supabase: SupabaseClient<Database>;
  /** The signed-in owner's identity. */
  user: { id: string; email: string | null };
  /** Always false now (kept for compatibility); the app is owner-only. */
  readOnly: boolean;
}

// Backwards-compatible alias for the previous return type name.
export type UserContext = AppContext;

/**
 * Resolve the request's data context. The app is PRIVATE: only the signed-in
 * owner gets a context (RLS client, full access). Without a session this returns
 * null and callers redirect to /welcome. There is no public read-only view any
 * more - the data lives entirely behind the auth gate.
 */
export async function getContext(): Promise<AppContext | null> {
  const rls = await createClient();
  const {
    data: { user },
  } = await rls.auth.getUser();
  if (!user) return null;
  return { supabase: rls, user: { id: user.id, email: user.email ?? null }, readOnly: false };
}

/**
 * Get the owner's data context, or redirect to /welcome when there's no session.
 * Also provisions the owner's settings + default lookups. Pages await this before
 * fetching, so setup is done.
 */
export async function requireUser(): Promise<AppContext> {
  const ctx = await getContext();
  if (!ctx) redirect("/welcome");
  await ensureUserSetup(ctx.supabase, ctx.user.id);
  return ctx;
}
