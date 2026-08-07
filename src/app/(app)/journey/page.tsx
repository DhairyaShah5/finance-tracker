import { requireUser } from "@/lib/queries";
import { accountActivity } from "@/lib/calc";
import { buildJourney } from "@/lib/journey";
import { todayISO } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Sparkles } from "lucide-react";
import { JourneyView } from "./journey-view";

export const dynamic = "force-dynamic";

export default async function JourneyPage() {
  const { supabase, user } = await requireUser();

  const [settingsRes, txnsRes, accountsRes, categoriesRes, indiaRes, inflowRes] = await Promise.all([
    supabase.from("settings").select("*").eq("user_id", user.id).maybeSingle(),
    supabase.from("transactions").select("*").eq("user_id", user.id).order("txn_date", { ascending: true }),
    supabase.from("accounts").select("*").eq("user_id", user.id).order("display_order"),
    supabase.from("categories").select("*").eq("user_id", user.id),
    supabase.from("india_transfers").select("*").eq("user_id", user.id),
    supabase.from("inflow_types").select("*").eq("user_id", user.id),
  ]);

  const txns = txnsRes.data ?? [];
  const accounts = accountsRes.data ?? [];
  const categories = categoriesRes.data ?? [];
  // Transfers the user excluded on the India page (money not tracked in any US
  // account, like a CD held outside the app) are left out of the debt math, so
  // true net worth stays honest. Written defensively in case the column is
  // missing (before the migration is applied).
  const india = (indiaRes.data ?? []).filter((t) => !t.exclude_from_net_worth);
  const inflowTypes = inflowRes.data ?? [];
  // These settings columns arrived via recent migrations. Read defensively so
  // the page works even before a column exists in the database.
  const settings = settingsRes.data as
    | { arrival_date?: string | null; birth_date?: string | null; debt_free_target_age?: number | null }
    | null;
  const arrivalDate = settings?.arrival_date ?? null;
  const birthDate = settings?.birth_date ?? null;
  const targetAge = settings?.debt_free_target_age ?? 25;

  // TOTAL net worth: every account balance summed (savings and investments
  // included; card debt subtracted). Category-linked investment credits are
  // already reflected in each destination account's balance here.
  const acctActivity = accountActivity(txns, accounts, categories);
  const netWorth = acctActivity.reduce((s, a) => s + a.balance, 0);

  const journey = buildJourney(txns, india, categories, inflowTypes, netWorth, todayISO(), arrivalDate, birthDate, targetAge);

  if (!journey) {
    return (
      <div className="space-y-6">
        <PageHeader title="Yearly Journey" description="Your financial story, one year at a time." />
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <Sparkles className="size-8 text-muted-foreground" />
            <div>
              <p className="font-medium">Your journey starts with your first transaction</p>
              <p className="text-sm text-muted-foreground">
                Add some activity and this page will chart your net worth and milestones year by year.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <JourneyView journey={journey} />;
}
