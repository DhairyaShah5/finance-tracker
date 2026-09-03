import { NextResponse } from "next/server";
import { getContext } from "@/lib/queries";
import { buildWorkbook } from "@/lib/excel";
import { todayISO } from "@/lib/format";

export const dynamic = "force-dynamic";

// Owner-only export of the entire dataset as a styled .xlsx workbook (one tab
// per page). The app is private: no session -> no context -> 401, so this is
// reachable only by the signed-in owner.
export async function GET() {
  const ctx = await getContext();
  if (!ctx) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  const { supabase, user } = ctx;

  const [settings, accounts, categories, inflowTypes, debtors, debtorLinks, transactions, indiaTransfers, otherIncome] =
    await Promise.all([
      supabase.from("settings").select("*").eq("user_id", user.id).maybeSingle(),
      supabase.from("accounts").select("*").eq("user_id", user.id).order("display_order"),
      supabase.from("categories").select("*").eq("user_id", user.id).order("display_order"),
      supabase.from("inflow_types").select("*").eq("user_id", user.id).order("display_order"),
      supabase.from("debtors").select("*").eq("user_id", user.id),
      supabase.from("transaction_debtors").select("*").eq("user_id", user.id),
      supabase.from("transactions").select("*").eq("user_id", user.id).order("txn_date", { ascending: true }),
      supabase.from("india_transfers").select("*").eq("user_id", user.id).order("transfer_date", { ascending: true }),
      supabase.from("other_income").select("*").eq("user_id", user.id),
    ]);

  const buffer = await buildWorkbook({
    settings: settings.data ?? null,
    accounts: accounts.data ?? [],
    categories: categories.data ?? [],
    inflowTypes: inflowTypes.data ?? [],
    debtors: debtors.data ?? [],
    debtorLinks: debtorLinks.data ?? [],
    transactions: transactions.data ?? [],
    indiaTransfers: indiaTransfers.data ?? [],
    otherIncome: otherIncome.data ?? [],
  });

  const filename = `finance-tracker-${todayISO()}.xlsx`;
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
