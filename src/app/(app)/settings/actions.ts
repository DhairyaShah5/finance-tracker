"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

type ActionResult = { ok: boolean; error?: string };

async function authed() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------
const settingsSchema = z.object({
  currency: z.string().trim().min(1, "Currency is required.").max(8, "Currency is too long."),
  starting_funds: z.coerce.number().min(0, "Starting funds can't be negative."),
  budget_months: z.coerce.number().int("Budget months must be a whole number.").min(1, "Budget months must be at least 1."),
});

export type SettingsInput = z.input<typeof settingsSchema>;

export async function updateSettings(input: SettingsInput): Promise<ActionResult> {
  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
  const { supabase, user } = await authed();
  if (!user) return { ok: false, error: "Not signed in." };

  const { error } = await supabase
    .from("settings")
    .update(parsed.data)
    .eq("user_id", user.id);
  if (error) return { ok: false, error: error.message };

  for (const p of ["/settings", "/"]) revalidatePath(p);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------
const categorySchema = z.object({
  name: z.string().trim().min(1, "Name is required."),
  color_hue: z.coerce.number().int().min(0, "Hue must be 0–360.").max(360, "Hue must be 0–360."),
  budget_group: z.enum(["needs", "wants", "savings"]).nullable().optional(),
});

export type CategoryInput = z.input<typeof categorySchema>;

function revalidateLists() {
  for (const p of ["/settings", "/transactions"]) revalidatePath(p);
}

export async function createCategory(input: CategoryInput): Promise<ActionResult> {
  const parsed = categorySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
  const { supabase, user } = await authed();
  if (!user) return { ok: false, error: "Not signed in." };

  const { data: maxRow } = await supabase
    .from("categories")
    .select("display_order")
    .eq("user_id", user.id)
    .order("display_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const display_order = (maxRow?.display_order ?? -1) + 1;

  const { error } = await supabase
    .from("categories")
    .insert({
      user_id: user.id,
      name: parsed.data.name,
      color_hue: parsed.data.color_hue,
      budget_group: parsed.data.budget_group ?? null,
      display_order,
    });
  if (error) return { ok: false, error: error.message };
  revalidateLists();
  return { ok: true };
}

export async function updateCategory(id: string, input: CategoryInput): Promise<ActionResult> {
  const parsed = categorySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
  const { supabase, user } = await authed();
  if (!user) return { ok: false, error: "Not signed in." };

  const { error } = await supabase
    .from("categories")
    .update({
      name: parsed.data.name,
      color_hue: parsed.data.color_hue,
      budget_group: parsed.data.budget_group ?? null,
    })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return { ok: false, error: error.message };
  revalidateLists();
  return { ok: true };
}

export async function deleteCategory(id: string): Promise<ActionResult> {
  const { supabase, user } = await authed();
  if (!user) return { ok: false, error: "Not signed in." };
  const { error } = await supabase.from("categories").delete().eq("id", id).eq("user_id", user.id);
  if (error) return { ok: false, error: error.message };
  revalidateLists();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Inflow types
// ---------------------------------------------------------------------------
const inflowSchema = z.object({
  name: z.string().trim().min(1, "Name is required."),
  is_paycheck: z.coerce.boolean(),
});

export type InflowTypeInput = z.input<typeof inflowSchema>;

export async function createInflowType(input: InflowTypeInput): Promise<ActionResult> {
  const parsed = inflowSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
  const { supabase, user } = await authed();
  if (!user) return { ok: false, error: "Not signed in." };

  const { data: maxRow } = await supabase
    .from("inflow_types")
    .select("display_order")
    .eq("user_id", user.id)
    .order("display_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const display_order = (maxRow?.display_order ?? -1) + 1;

  const { error } = await supabase
    .from("inflow_types")
    .insert({ user_id: user.id, name: parsed.data.name, is_paycheck: parsed.data.is_paycheck, display_order });
  if (error) return { ok: false, error: error.message };
  revalidateLists();
  return { ok: true };
}

export async function updateInflowType(id: string, input: InflowTypeInput): Promise<ActionResult> {
  const parsed = inflowSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
  const { supabase, user } = await authed();
  if (!user) return { ok: false, error: "Not signed in." };

  const { error } = await supabase
    .from("inflow_types")
    .update({ name: parsed.data.name, is_paycheck: parsed.data.is_paycheck })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return { ok: false, error: error.message };
  revalidateLists();
  return { ok: true };
}

export async function deleteInflowType(id: string): Promise<ActionResult> {
  const { supabase, user } = await authed();
  if (!user) return { ok: false, error: "Not signed in." };
  const { error } = await supabase.from("inflow_types").delete().eq("id", id).eq("user_id", user.id);
  if (error) return { ok: false, error: error.message };
  revalidateLists();
  return { ok: true };
}
