import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ensureUserSetup } from "@/lib/setup";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

export interface UserContext {
  supabase: SupabaseClient<Database>;
  user: User;
}

/**
 * Get the authed user + a request-bound Supabase client, or redirect to /login.
 * Also ensures the user's settings row and default lookups exist BEFORE the
 * caller fetches data - pages await this first, which (unlike the layout, that
 * renders in parallel with the page) guarantees setup is complete.
 */
export async function requireUser(): Promise<UserContext> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  await ensureUserSetup(supabase, user.id);
  return { supabase, user };
}
