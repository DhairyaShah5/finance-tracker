import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

export interface UserContext {
  supabase: SupabaseClient<Database>;
  user: User;
}

/** Get the authed user + a request-bound Supabase client, or redirect to /login. */
export async function requireUser(): Promise<UserContext> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}
