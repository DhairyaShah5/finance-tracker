import { requireUser } from "@/lib/queries";
import { PageHeader } from "@/components/page-header";
import { SettingsForm } from "./settings-form";
import { ListsManager } from "./lists-manager";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const { supabase, user } = await requireUser();

  const [settingsRes, categoriesRes, inflowRes] = await Promise.all([
    supabase.from("settings").select("*").eq("user_id", user.id).single(),
    supabase.from("categories").select("*").eq("user_id", user.id).order("display_order"),
    supabase.from("inflow_types").select("*").eq("user_id", user.id).order("display_order"),
  ]);

  const settings = settingsRes.data;
  const categories = categoriesRes.data ?? [];
  const inflowTypes = inflowRes.data ?? [];

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

      <ListsManager categories={categories} inflowTypes={inflowTypes} />
    </div>
  );
}
