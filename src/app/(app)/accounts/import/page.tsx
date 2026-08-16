import { requireUser } from "@/lib/queries";
import { ImportView } from "./import-view";

export const dynamic = "force-dynamic";

export default async function ImportTransfersPage() {
  const { supabase, user } = await requireUser();
  const { data } = await supabase
    .from("accounts")
    .select("name")
    .eq("user_id", user.id)
    .order("display_order");
  return <ImportView accountNames={(data ?? []).map((a) => a.name)} />;
}
