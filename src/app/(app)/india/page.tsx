import { requireUser } from "@/lib/queries";
import { IndiaView } from "./india-view";

export const dynamic = "force-dynamic";

export default async function IndiaPage() {
  const { supabase, user } = await requireUser();

  const [transfersRes] = await Promise.all([
    supabase
      .from("india_transfers")
      .select("*")
      .eq("user_id", user.id)
      .order("transfer_date", { ascending: true }),
  ]);

  return <IndiaView transfers={transfersRes.data ?? []} />;
}
