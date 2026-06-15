"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { ACCOUNT_TYPES } from "@/lib/defaults";

const schema = z.object({
  name: z.string().trim().min(1, "Name is required."),
  bank: z.string().trim().min(1).optional(),
  type: z.enum(ACCOUNT_TYPES),
  opening_balance: z.coerce.number(),
  is_credit: z.boolean(),
  include_in_net_worth: z.boolean(),
  display_order: z.coerce.number().int(),
});

export type AccountInput = z.input<typeof schema>;
type ActionResult = { ok: boolean; error?: string };

function normalize(data: z.output<typeof schema>) {
  return {
    name: data.name,
    bank: data.bank?.trim() || "Other",
    type: data.type,
    opening_balance: data.opening_balance,
    // Credit-card accounts are always credit, regardless of the checkbox.
    is_credit: data.type === "credit_card" ? true : data.is_credit,
    include_in_net_worth: data.include_in_net_worth,
    display_order: data.display_order,
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
  for (const p of ["/accounts", "/"]) revalidatePath(p);
}

/** Postgres unique-violation -> friendly per-user "name taken" message. */
function isUniqueViolation(message: string): boolean {
  return /duplicate key|unique constraint|already exists/i.test(message);
}

/** Postgres FK restrict (account still referenced by transactions). */
function isForeignKeyViolation(message: string): boolean {
  return /foreign key|violates foreign key constraint|still referenced/i.test(message);
}

export async function createAccount(input: AccountInput): Promise<ActionResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
  const { supabase, user } = await authed();
  if (!user) return { ok: false, error: "Not signed in." };

  const { error } = await supabase
    .from("accounts")
    .insert({ user_id: user.id, ...normalize(parsed.data) });
  if (error) {
    if (isUniqueViolation(error.message)) {
      return { ok: false, error: "An account with that name already exists." };
    }
    return { ok: false, error: error.message };
  }
  revalidate();
  return { ok: true };
}

export async function updateAccount(id: string, input: AccountInput): Promise<ActionResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
  const { supabase, user } = await authed();
  if (!user) return { ok: false, error: "Not signed in." };

  const { error } = await supabase
    .from("accounts")
    .update(normalize(parsed.data))
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) {
    if (isUniqueViolation(error.message)) {
      return { ok: false, error: "An account with that name already exists." };
    }
    return { ok: false, error: error.message };
  }
  revalidate();
  return { ok: true };
}

export async function deleteAccount(id: string): Promise<ActionResult> {
  const { supabase, user } = await authed();
  if (!user) return { ok: false, error: "Not signed in." };

  const { error } = await supabase.from("accounts").delete().eq("id", id).eq("user_id", user.id);
  if (error) {
    if (isForeignKeyViolation(error.message)) {
      return { ok: false, error: "Account has transactions; reassign or delete them first." };
    }
    return { ok: false, error: error.message };
  }
  revalidate();
  return { ok: true };
}
