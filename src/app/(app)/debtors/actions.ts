"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  name: z.string().trim().min(1, "Name is required."),
  note: z.string().trim().nullable().optional(),
});

export type DebtorInput = z.input<typeof schema>;
type ActionResult = { ok: boolean; error?: string };

async function authed() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

function revalidate() {
  for (const p of ["/debtors", "/"]) revalidatePath(p);
}

function normalize(data: z.output<typeof schema>) {
  return {
    name: data.name,
    note: data.note?.trim() ? data.note.trim() : null,
  };
}

/** Map common Postgres errors to friendly text. */
function friendlyError(message: string): string {
  if (/duplicate key|unique/i.test(message)) {
    return "A debtor with that name already exists.";
  }
  return message;
}

export async function createDebtor(input: DebtorInput): Promise<ActionResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
  const { supabase, user } = await authed();
  if (!user) return { ok: false, error: "Not signed in." };

  const { error } = await supabase
    .from("debtors")
    .insert({ user_id: user.id, ...normalize(parsed.data) });
  if (error) return { ok: false, error: friendlyError(error.message) };
  revalidate();
  return { ok: true };
}

export async function updateDebtor(id: string, input: DebtorInput): Promise<ActionResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
  const { supabase, user } = await authed();
  if (!user) return { ok: false, error: "Not signed in." };

  const { error } = await supabase
    .from("debtors")
    .update(normalize(parsed.data))
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return { ok: false, error: friendlyError(error.message) };
  revalidate();
  return { ok: true };
}

export async function deleteDebtor(id: string): Promise<ActionResult> {
  const { supabase, user } = await authed();
  if (!user) return { ok: false, error: "Not signed in." };
  // FK on transactions.debtor_id is ON DELETE SET NULL, so attributed
  // transactions are simply un-assigned, not removed.
  const { error } = await supabase.from("debtors").delete().eq("id", id).eq("user_id", user.id);
  if (error) return { ok: false, error: error.message };
  revalidate();
  return { ok: true };
}
