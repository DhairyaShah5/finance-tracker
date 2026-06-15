"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  transfer_date: z.string().min(10),
  direction: z.enum(["received", "sent"]),
  description: z.string().trim().min(1, "Description is required."),
  endpoint: z.string().trim().nullable().optional(),
  usd_amount: z.coerce.number().positive("USD amount must be greater than 0."),
  inr_amount: z.coerce.number().positive("INR amount must be greater than 0."),
  notes: z.string().trim().nullable().optional(),
});

export type TransferInput = z.input<typeof schema>;
type ActionResult = { ok: boolean; error?: string };

// effective_fx_rate is a generated DB column — never write it.
function normalize(data: z.output<typeof schema>) {
  return {
    transfer_date: data.transfer_date,
    direction: data.direction,
    description: data.description,
    endpoint: data.endpoint || null,
    usd_amount: data.usd_amount,
    inr_amount: data.inr_amount,
    notes: data.notes || null,
  };
}

async function authed() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

function revalidate() {
  for (const p of ["/india", "/"]) revalidatePath(p);
}

export async function createTransfer(input: TransferInput): Promise<ActionResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
  const { supabase, user } = await authed();
  if (!user) return { ok: false, error: "Not signed in." };

  const { error } = await supabase
    .from("india_transfers")
    .insert({ user_id: user.id, ...normalize(parsed.data) });
  if (error) return { ok: false, error: error.message };
  revalidate();
  return { ok: true };
}

export async function updateTransfer(id: string, input: TransferInput): Promise<ActionResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
  const { supabase, user } = await authed();
  if (!user) return { ok: false, error: "Not signed in." };

  const { error } = await supabase
    .from("india_transfers")
    .update(normalize(parsed.data))
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return { ok: false, error: error.message };
  revalidate();
  return { ok: true };
}

export async function deleteTransfer(id: string): Promise<ActionResult> {
  const { supabase, user } = await authed();
  if (!user) return { ok: false, error: "Not signed in." };
  const { error } = await supabase
    .from("india_transfers")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return { ok: false, error: error.message };
  revalidate();
  return { ok: true };
}
