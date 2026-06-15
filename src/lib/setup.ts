import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, SettingsRow } from "@/lib/database.types";
import {
  DEFAULT_ACCOUNTS,
  DEFAULT_CATEGORIES,
  DEFAULT_INFLOW_TYPES,
} from "@/lib/defaults";

type Client = SupabaseClient<Database>;

/**
 * Idempotently provisions a new user: creates their settings row and seeds the
 * default accounts / categories / inflow types (the workbook's dropdown lists)
 * if they have none yet. Safe to call on every authed page load.
 */
export async function ensureUserSetup(supabase: Client, userId: string): Promise<SettingsRow> {
  const { data: existing } = await supabase
    .from("settings")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  let settings = existing;
  if (!settings) {
    const { data: inserted } = await supabase
      .from("settings")
      .insert({ user_id: userId })
      .select("*")
      .single();
    settings = inserted!;

    // First-time seed of the canonical lookup lists.
    await supabase.from("accounts").insert(
      DEFAULT_ACCOUNTS.map((a, i) => ({ ...a, user_id: userId, display_order: i })),
    );
    await supabase.from("categories").insert(
      DEFAULT_CATEGORIES.map((c, i) => ({ ...c, user_id: userId, display_order: i })),
    );
    await supabase.from("inflow_types").insert(
      DEFAULT_INFLOW_TYPES.map((t, i) => ({ ...t, user_id: userId, display_order: i })),
    );
  }

  return settings!;
}
