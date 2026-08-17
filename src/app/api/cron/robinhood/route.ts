import { timingSafeEqual } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/service";
import type { Database } from "@/lib/database.types";

// Weekly RobinHood deposit, added automatically every Tuesday. Replicates the
// hand-entered pattern exactly: a $100 outflow from Chase Checking in the
// Investment category (which routes into the RobinHood account), tagged savings,
// described "RobinHood #N" with an auto-incrementing counter.
//
// Wiring: invoked by the Vercel Cron in vercel.json. Protected by CRON_SECRET
// (Vercel sends it as `Authorization: Bearer <CRON_SECRET>`). With no secret set
// it returns 401 and inserts nothing, so it fails safe. Idempotent per week.

export const dynamic = "force-dynamic";

/** Constant-time string compare (avoids leaking the secret via timing). */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

type TxnInsert = Database["public"]["Tables"]["transactions"]["Insert"];

const DEPOSIT = {
  categoryName: "Investment", // linked to the RobinHood account
  accountName: "Chase Checking", // the source account the $100 leaves from
  amount: 100,
  labelPrefix: "RobinHood", // description = "RobinHood #N"
  budgetGroup: "savings" as const,
  timeZone: "America/Los_Angeles",
};

/** The calendar date of this week's Tuesday, in the user's local timezone. */
function localTuesday(now: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  const wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
  const daysSinceTuesday = (wd + 5) % 7;
  // Anchor the local calendar date at UTC midnight and do integer day math, so
  // there's no timezone drift; slice back to YYYY-MM-DD.
  const anchor = new Date(`${get("year")}-${get("month")}-${get("day")}T00:00:00Z`);
  anchor.setUTCDate(anchor.getUTCDate() - daysSinceTuesday);
  return anchor.toISOString().slice(0, 10);
}

/** Next "RobinHood #N" number, from the highest one already on the ledger. */
function nextIndex(descriptions: string[]): number {
  let max = 0;
  for (const d of descriptions) {
    const m = /#(\d+)/.exec(d ?? "");
    if (m) max = Math.max(max, Number(m[1]));
  }
  return max + 1;
}

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!cronSecret || !authHeader || !safeEqual(authHeader, `Bearer ${cronSecret}`)) {
    return new Response("Unauthorized", { status: 401 });
  }

  // ?dryRun=1 reports what it would do without writing (for verification).
  const dryRun = new URL(request.url).searchParams.get("dryRun") === "1";
  const supabase = createServiceClient();

  // Single-owner app: the lone settings row identifies the owner.
  const { data: owner } = await supabase.from("settings").select("user_id").limit(1).maybeSingle();
  const userId = owner?.user_id;
  if (!userId) return Response.json({ ok: false, error: "No owner found." }, { status: 500 });

  const [{ data: cat }, { data: acct }] = await Promise.all([
    supabase.from("categories").select("id").eq("user_id", userId).eq("name", DEPOSIT.categoryName).maybeSingle(),
    supabase.from("accounts").select("id").eq("user_id", userId).eq("name", DEPOSIT.accountName).maybeSingle(),
  ]);
  if (!cat?.id || !acct?.id) {
    return Response.json(
      { ok: false, error: `Missing category "${DEPOSIT.categoryName}" or account "${DEPOSIT.accountName}".` },
      { status: 500 },
    );
  }

  const tuesday = localTuesday(new Date(), DEPOSIT.timeZone);

  // Idempotent: skip if this week's RobinHood deposit is already on the ledger
  // (whether added by the cron, a retry, or by hand).
  const { data: already } = await supabase
    .from("transactions")
    .select("id")
    .eq("user_id", userId)
    .eq("category_id", cat.id)
    .eq("txn_date", tuesday)
    .ilike("description", `${DEPOSIT.labelPrefix}%`)
    .maybeSingle();
  if (already?.id) {
    return Response.json({ ok: true, action: "skipped", reason: "already added this week", txn_date: tuesday });
  }

  const { data: prior } = await supabase
    .from("transactions")
    .select("description")
    .eq("user_id", userId)
    .ilike("description", `${DEPOSIT.labelPrefix}%`);
  const description = `${DEPOSIT.labelPrefix} #${nextIndex((prior ?? []).map((t) => t.description))}`;

  const row: TxnInsert = {
    user_id: userId,
    txn_date: tuesday,
    account_id: acct.id,
    category_id: cat.id,
    description,
    direction: "outflow",
    amount: DEPOSIT.amount,
    is_transfer: false,
    whose_expense: "My",
    budget_group: DEPOSIT.budgetGroup,
  };

  if (dryRun) {
    return Response.json({ ok: true, action: "dry-run", would_insert: row });
  }

  const { error } = await supabase.from("transactions").insert(row);
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

  return Response.json({ ok: true, action: "created", description, txn_date: tuesday, amount: DEPOSIT.amount });
}
