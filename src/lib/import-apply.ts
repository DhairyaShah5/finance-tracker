// Applies a ParsedWorkbook into the database for a user. Resolves
// category/account/inflow-type names to ids (creating any that are missing),
// optionally replacing the user's existing imported data first.
//
// Shared by the in-app import action (server client) and the dev seed script
// (service-role client). No 'server-only' import so tsx can use it too.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import type { ParsedWorkbook } from "@/lib/import-parse";
import { DEFAULT_ACCOUNTS, DEFAULT_CATEGORIES, DEFAULT_INFLOW_TYPES } from "@/lib/defaults";

type Client = SupabaseClient<Database>;

export interface ImportResult {
  transactions: number;
  indiaTransfers: number;
  otherIncome: number;
  startingFunds: number | null;
}

export async function importParsedWorkbook(
  supabase: Client,
  userId: string,
  parsed: ParsedWorkbook,
  opts: { replace?: boolean } = {},
): Promise<ImportResult> {
  const { replace = true } = opts;

  // 1) Ensure settings row + update starting funds.
  const settingsPatch: Database["public"]["Tables"]["settings"]["Insert"] = { user_id: userId };
  if (parsed.startingFunds != null) settingsPatch.starting_funds = parsed.startingFunds;
  await supabase.from("settings").upsert(settingsPatch, { onConflict: "user_id" });

  // 2) Resolve / create lookup rows, building name -> id maps.
  const accountMap = await ensureLookup(
    supabase,
    userId,
    "accounts",
    new Set(parsed.transactions.map((t) => t.accountName).filter(Boolean) as string[]),
    (name) => {
      const def = DEFAULT_ACCOUNTS.find((a) => a.name === name);
      return def
        ? { name, bank: def.bank, type: def.type, is_credit: def.is_credit }
        : { name, bank: "Other", type: "checking" as const, is_credit: /credit/i.test(name) };
    },
  );

  const categoryMap = await ensureLookup(
    supabase,
    userId,
    "categories",
    new Set(parsed.transactions.map((t) => t.categoryName).filter(Boolean) as string[]),
    (name) => {
      const def = DEFAULT_CATEGORIES.find((c) => c.name === name);
      return { name, color_hue: def?.color_hue ?? 250 };
    },
  );

  const inflowMap = await ensureLookup(
    supabase,
    userId,
    "inflow_types",
    new Set(parsed.transactions.map((t) => t.inflowTypeName).filter(Boolean) as string[]),
    (name) => {
      const def = DEFAULT_INFLOW_TYPES.find((i) => i.name === name);
      return { name, is_paycheck: def?.is_paycheck ?? /paycheck/i.test(name) };
    },
  );

  // 3) Replace existing data if requested.
  if (replace) {
    for (const table of ["transactions", "india_transfers", "other_income"] as const) {
      await supabase.from(table).delete().eq("user_id", userId);
    }
  }

  // 4) Insert transactions.
  const txnRows = parsed.transactions
    .map((t) => {
      const account_id = t.accountName ? accountMap.get(t.accountName) : null;
      if (!account_id) return null; // account is required by the schema
      return {
        user_id: userId,
        txn_date: t.txn_date,
        account_id,
        category_id: t.categoryName ? categoryMap.get(t.categoryName) ?? null : null,
        description: t.description,
        direction: t.direction,
        amount: t.amount,
        inflow_type_id: t.inflowTypeName ? inflowMap.get(t.inflowTypeName) ?? null : null,
        whose_expense: t.whoseExpense,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r != null);
  if (txnRows.length) await supabase.from("transactions").insert(txnRows);

  // 5) Insert India transfers.
  const indiaRows = parsed.indiaTransfers.map((t) => ({ user_id: userId, ...t }));
  if (indiaRows.length) await supabase.from("india_transfers").insert(indiaRows);

  // 6) Insert other income.
  const otherRows = parsed.otherIncome.map((o) => ({ user_id: userId, ...o }));
  if (otherRows.length) await supabase.from("other_income").insert(otherRows);

  return {
    transactions: txnRows.length,
    indiaTransfers: indiaRows.length,
    otherIncome: otherRows.length,
    startingFunds: parsed.startingFunds,
  };
}

type LookupTable = "accounts" | "categories" | "inflow_types";

/** Fetch existing lookup rows, create any missing names, return name->id map. */
async function ensureLookup(
  supabase: Client,
  userId: string,
  table: LookupTable,
  names: Set<string>,
  makeRow: (name: string) => Record<string, unknown>,
): Promise<Map<string, string>> {
  const { data: existing } = await supabase
    .from(table)
    .select("id, name")
    .eq("user_id", userId);

  const map = new Map<string, string>();
  for (const row of existing ?? []) map.set(row.name as string, row.id as string);

  const missing = [...names].filter((n) => !map.has(n));
  if (missing.length) {
    const rows = missing.map((name) => ({ user_id: userId, ...makeRow(name) }));
    // `table` is a union here, so the typed insert can't be narrowed; cast.
    const { data: inserted } = await (supabase.from(table) as ReturnType<Client["from"]>)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .insert(rows as any)
      .select("id, name");
    for (const row of (inserted ?? []) as { id: string; name: string }[]) {
      map.set(row.name, row.id);
    }
  }
  return map;
}
