"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { EyeOff } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Money } from "@/components/money";
import { cn } from "@/lib/utils";
import { useReadOnly } from "@/components/read-only-context";
import { setAccountHidden } from "../accounts/actions";

type Acct = { id: string; name: string; bank: string; balance: number; isCredit: boolean; hidden: boolean };

export function AccountVisibility({ accounts }: { accounts: Acct[] }) {
  const router = useRouter();
  const readOnly = useReadOnly();
  const [pending, start] = React.useTransition();
  const [busyId, setBusyId] = React.useState<string | null>(null);

  const hiddenCount = accounts.filter((a) => a.hidden).length;

  function toggle(a: Acct, show: boolean) {
    if (readOnly) return void toast.info("View only - sign in to make changes.");
    setBusyId(a.id);
    start(async () => {
      const res = await setAccountHidden(a.id, !show); // show === true → hidden = false
      setBusyId(null);
      if (!res.ok) return void toast.error(res.error ?? "Could not update.");
      toast.success(show ? `${a.name} is included again.` : `${a.name} is no longer included.`);
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Accounts included in the app</CardTitle>
        <p className="text-sm text-muted-foreground">
          Turn an account off to leave it out of the app: its balance leaves your net worth and its
          transactions drop out of every total. The transactions themselves stay in your ledger, and the
          Transactions page can bring them back on demand.
        </p>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {accounts.length === 0 ? (
          <p className="text-sm text-muted-foreground">No accounts yet.</p>
        ) : (
          accounts.map((a) => (
            <div
              key={a.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5"
            >
              <div className="min-w-0">
                <p className={cn("truncate text-sm font-medium", a.hidden && "text-muted-foreground")}>{a.name}</p>
                <p className="flex items-center gap-1 text-xs text-muted-foreground">
                  <span>{a.bank}</span>
                  <span>·</span>
                  <Money value={a.balance} cents colored={a.isCredit} className="tnum" />
                  {a.hidden ? <span>· not included</span> : null}
                </p>
              </div>
              <Switch
                checked={!a.hidden}
                onCheckedChange={(v) => toggle(a, v)}
                disabled={pending && busyId === a.id}
                aria-label={`Show ${a.name} in the app`}
              />
            </div>
          ))
        )}
        {hiddenCount > 0 ? (
          <p className="pt-1 text-xs text-muted-foreground">
            <EyeOff className="mr-1 inline size-3" />
            {hiddenCount} account{hiddenCount === 1 ? "" : "s"} not included. Every number across the app leaves{" "}
            {hiddenCount === 1 ? "it" : "them"} out.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
