"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, ArrowLeft, CheckCircle2, Loader2, Flag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fmtMoney, fmtDate, todayISO } from "@/lib/format";
import { reconcileAccount, attestReconciliation, type ReconcileResult } from "../actions";

type Acct = { id: string; name: string; isCredit: boolean; balance: number; reconciledThrough: string | null };
type ReconRecord = {
  accountId: string;
  asOf: string;
  statementBalance: number;
  difference: number | null;
  method: "matched" | "attested";
  recordedOn: string;
};

export function ReconcileView({ accounts, history }: { accounts: Acct[]; history: ReconRecord[] }) {
  const [accountId, setAccountId] = React.useState(accounts[0]?.id ?? "");
  const [date, setDate] = React.useState(todayISO());
  const [balance, setBalance] = React.useState("");
  const [result, setResult] = React.useState<ReconcileResult | null>(null);
  const [pending, start] = React.useTransition();
  const router = useRouter();

  const acct = accounts.find((a) => a.id === accountId);
  const canSubmit = Boolean(accountId) && balance.trim() !== "";
  const acctHistory = history.filter((h) => h.accountId === accountId);

  function check() {
    if (!accountId) return void toast.error("Pick an account.");
    if (balance.trim() === "") return void toast.error("Enter the statement's closing balance.");
    start(async () => {
      const res = await reconcileAccount({ account_id: accountId, as_of_date: date, statement_balance: balance });
      if (!res.ok) {
        setResult(null);
        return void toast.error(res.error ?? "Could not reconcile.");
      }
      setResult(res);
      if (res.reconciled) {
        toast.success(`Stamped reconciled through ${res.recordedThrough}.`);
        router.refresh();
      }
    });
  }

  // Trust the statement over the momentarily-behind ledger: stamp the checkpoint
  // so the next cycle measures forward from this verified balance.
  function attest() {
    if (!canSubmit) return;
    start(async () => {
      const res = await attestReconciliation({ account_id: accountId, as_of_date: date, statement_balance: balance });
      if (!res.ok) return void toast.error(res.error ?? "Could not mark reconciled.");
      setResult(res);
      toast.success(`Marked reconciled through ${res.recordedThrough} from the statement.`);
      router.refresh();
    });
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="space-y-1">
        <Link href="/accounts" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> Accounts
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Reconcile to a statement</h1>
        <p className="text-sm text-muted-foreground">
          Each time a statement arrives, check its closing balance against your ledger. Once an account has a
          reconciled point, each new statement is checked over just that one closed cycle, so an unfinished
          current month can&apos;t throw off a statement that already closed.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Check an account</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>Account</Label>
            <Select value={accountId} onValueChange={(v) => { setAccountId(v); setResult(null); }}>
              <SelectTrigger><SelectValue placeholder="Account" /></SelectTrigger>
              <SelectContent>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {acct ? (
              <p className="text-xs text-muted-foreground">
                In the app right now: {fmtMoney(acct.balance, { cents: true })}.{" "}
                {acct.reconciledThrough
                  ? `Last reconciled through ${fmtDate(acct.reconciledThrough, "short")}.`
                  : "Not reconciled yet, this first check measures back from today."}{" "}
                {acct.isCredit ? "Credit cards are negative when you owe, so enter the statement the same way (owe $149.95 → -149.95)." : null}
              </p>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="r-date">Statement closing date</Label>
              <Input id="r-date" type="date" value={date} onChange={(e) => { setDate(e.target.value); setResult(null); }} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="r-bal">Statement closing balance</Label>
              <Input
                id="r-bal"
                type="number"
                step="0.01"
                inputMode="decimal"
                value={balance}
                onChange={(e) => { setBalance(e.target.value); setResult(null); }}
                placeholder="0.00"
              />
            </div>
          </div>

          <Button onClick={check} disabled={pending || !canSubmit}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : null} Check
          </Button>
        </CardContent>
      </Card>

      {result?.ok ? (
        <Card>
          <CardContent className="space-y-4 pt-6">
            {result.basis === "checkpoint" && result.measuredFrom ? (
              <p className="text-xs text-muted-foreground">
                Measured forward from your last reconciled point
                {" "}({fmtDate(result.measuredFrom, "short")}, {fmtMoney(result.measuredFromBalance ?? 0, { cents: true })})
                {" "}over this cycle only, today&apos;s balance and the open month aren&apos;t in the math.
              </p>
            ) : null}

            {result.attested ? (
              <div className="flex items-start gap-3">
                <Flag className="mt-0.5 size-5 text-emerald-600 dark:text-emerald-500" />
                <div>
                  <p className="font-medium text-emerald-600 dark:text-emerald-500">Marked reconciled from the statement</p>
                  <p className="text-sm text-muted-foreground">
                    Recorded {fmtMoney(result.statementBalance ?? 0, { cents: true })} as verified on {result.asOf}. This account
                    is now stamped <span className="font-medium text-foreground">reconciled through {result.recordedThrough}</span>,
                    and your next statement will be checked forward from here.
                  </p>
                </div>
              </div>
            ) : result.reconciled ? (
              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 size-5 text-emerald-600 dark:text-emerald-500" />
                <div>
                  <p className="font-medium text-emerald-600 dark:text-emerald-500">Reconciled</p>
                  <p className="text-sm text-muted-foreground">
                    Your ledger matches the statement to the cent on {result.asOf}. Nothing missing. This account
                    is now stamped <span className="font-medium text-foreground">reconciled through {result.recordedThrough}</span>.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 size-5 text-amber-600 dark:text-amber-500" />
                  <div>
                    <p className="font-medium text-amber-600 dark:text-amber-500">
                      Off by {fmtMoney(Math.abs(result.difference ?? 0), { cents: true })}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Ledger says {fmtMoney(result.ledgerBalance ?? 0, { cents: true })} on {result.asOf}; the statement
                      says {fmtMoney(result.statementBalance ?? 0, { cents: true })}.{" "}
                      {result.basis === "checkpoint"
                        ? "A transaction inside this cycle is missing or wrong, compare the list below against the statement."
                        : "A transaction in this period is missing or wrong, most often a card payment that was never logged. Compare the list below, then add it via Transfer / Pay off (or Import)."}
                    </p>
                  </div>
                </div>

                <div className="rounded-md border border-dashed p-3">
                  <p className="text-sm">
                    Sure the statement&apos;s {fmtMoney(result.statementBalance ?? 0, { cents: true })} is right and the
                    gap is just recent activity you haven&apos;t entered yet? Trust the statement, it&apos;s the source of
                    truth, and record it as your reconciled point.
                  </p>
                  <Button variant="outline" size="sm" className="mt-2" onClick={attest} disabled={pending}>
                    {pending ? <Loader2 className="size-4 animate-spin" /> : <Flag className="size-4" />}
                    Mark reconciled anyway
                  </Button>
                </div>
              </div>
            )}

            {result.periodTxns && result.periodTxns.length > 0 ? (
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full text-sm tnum">
                  <thead>
                    <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                      <th className="px-3 py-2 font-medium">Date</th>
                      <th className="px-3 py-2 font-medium">Description</th>
                      <th className="px-3 py-2 text-right font-medium">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.periodTxns.map((t, i) => (
                      <tr key={i} className="border-b last:border-0">
                        <td className="px-3 py-1.5 whitespace-nowrap text-muted-foreground">{t.date}</td>
                        <td className="px-3 py-1.5">{t.description}</td>
                        <td className="px-3 py-1.5 text-right">{fmtMoney(t.signed, { cents: true, sign: true })}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Reconciliation history{acct ? <span className="ml-2 font-normal text-muted-foreground">{acct.name}</span> : null}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {acctHistory.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No reconciliations recorded for this account yet. Each statement you reconcile shows up here.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm tnum">
                <thead>
                  <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                    <th className="px-3 py-2 font-medium">Statement date</th>
                    <th className="px-3 py-2 text-right font-medium">Closing balance</th>
                    <th className="px-3 py-2 font-medium">Result</th>
                    <th className="px-3 py-2 font-medium">Reconciled on</th>
                  </tr>
                </thead>
                <tbody>
                  {acctHistory.map((h) => (
                    <tr key={h.asOf} className="border-b last:border-0">
                      <td className="px-3 py-1.5 whitespace-nowrap">{fmtDate(h.asOf, "short")}</td>
                      <td className="px-3 py-1.5 text-right">{fmtMoney(h.statementBalance, { cents: true })}</td>
                      <td className="px-3 py-1.5">
                        {h.method === "matched" ? (
                          <span className="text-emerald-600 dark:text-emerald-500">Matched</span>
                        ) : (
                          <span className="text-sky-600 dark:text-sky-500">Attested</span>
                        )}
                      </td>
                      <td className="px-3 py-1.5 whitespace-nowrap text-muted-foreground">{fmtDate(h.recordedOn, "short")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
