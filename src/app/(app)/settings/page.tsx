import { requireUser } from "@/lib/queries";
import { accountActivity } from "@/lib/calc";
import { PageHeader } from "@/components/page-header";
import { SettingsForm } from "./settings-form";
import { ListsManager } from "./lists-manager";
import { AccountVisibility } from "./account-visibility";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const { supabase, user } = await requireUser();

  const [settingsRes, categoriesRes, inflowRes, accountsRes, txnsRes] = await Promise.all([
    supabase.from("settings").select("*").eq("user_id", user.id).single(),
    supabase.from("categories").select("*").eq("user_id", user.id).order("display_order"),
    supabase.from("inflow_types").select("*").eq("user_id", user.id).order("display_order"),
    supabase.from("accounts").select("*").eq("user_id", user.id).order("display_order"),
    supabase.from("transactions").select("*").eq("user_id", user.id),
  ]);

  const settings = settingsRes.data;
  const categories = categoriesRes.data ?? [];
  const inflowTypes = inflowRes.data ?? [];

  // Balances are shown next to each toggle so it's clear how much net worth a
  // hidden account takes with it.
  const accounts = accountActivity(txnsRes.data ?? [], accountsRes.data ?? [], categories).map((a) => ({
    id: a.account.id,
    name: a.account.name,
    bank: a.account.bank,
    balance: a.balance,
    isCredit: a.account.is_credit,
    hidden: a.account.hidden,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Tune your budget and manage your categories and income types."
      />

      {settings ? (
        <SettingsForm settings={settings} />
      ) : (
        <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
          We couldn&apos;t load your settings. Try refreshing the page.
        </div>
      )}

      <AccountVisibility accounts={accounts} />

      <ListsManager categories={categories} inflowTypes={inflowTypes} />
    </div>
  );
}
