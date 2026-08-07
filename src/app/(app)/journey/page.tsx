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

  const [txnsRes, accountsRes, categoriesRes, indiaRes] = await Promise.all([
    supabase.from("transactions").select("*").eq("user_id", user.id).order("txn_date", { ascending: true }),
    supabase.from("accounts").select("*").eq("user_id", user.id).order("display_order"),
    supabase.from("categories").select("*").eq("user_id", user.id),
    supabase.from("india_transfers").select("*").eq("user_id", user.id),
  ]);

  const txns = txnsRes.data ?? [];
  const accounts = accountsRes.data ?? [];
  const categories = categoriesRes.data ?? [];
  const india = indiaRes.data ?? [];

  // Canonical available-funds net worth - the same figure the dashboard and
  // reconcile() use (accounts flagged into net worth).
  const acctActivity = accountActivity(txns, accounts, categories);
  const netWorth = acctActivity
    .filter((a) => a.account.include_in_net_worth)
    .reduce((s, a) => s + a.balance, 0);

  const journey = buildJourney(txns, accounts, india, categories, netWorth, todayISO());

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
