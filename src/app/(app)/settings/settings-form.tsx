"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useReadOnly } from "@/components/read-only-context";
import { fmtMoney } from "@/lib/format";
import type { SettingsRow } from "@/lib/database.types";
import { updateSettings, type SettingsInput } from "./actions";

export function SettingsForm({ settings }: { settings: SettingsRow }) {
  const router = useRouter();
  const readOnly = useReadOnly();
  const [pending, start] = React.useTransition();

  const [currency, setCurrency] = React.useState(settings.currency);
  const [startingFunds, setStartingFunds] = React.useState(String(settings.starting_funds));
  const [budgetMonths, setBudgetMonths] = React.useState(String(settings.budget_months));
  const [savingsTarget, setSavingsTarget] = React.useState(String(settings.savings_target));
  const [arrivalDate, setArrivalDate] = React.useState(settings.arrival_date ?? "");
  const [birthDate, setBirthDate] = React.useState(settings.birth_date ?? "");
  const [targetAge, setTargetAge] = React.useState(String(settings.debt_free_target_age ?? 25));

  const funds = Number(startingFunds);
  const months = Number(budgetMonths);
  const derivedBudget =
    Number.isFinite(funds) && Number.isFinite(months) && months > 0 ? funds / months : 0;

  function submit() {
    if (readOnly) {
      toast.info("View only - sign in to make changes.");
      return;
    }
    const input: SettingsInput = {
      currency: currency.trim(),
      starting_funds: startingFunds,
      budget_months: budgetMonths,
      savings_target: savingsTarget,
      arrival_date: arrivalDate,
      birth_date: birthDate,
      debt_free_target_age: targetAge,
    };
    start(async () => {
      const res = await updateSettings(input);
      if (!res.ok) {
        toast.error(res.error ?? "Failed to save settings.");
        return;
      }
      toast.success("Settings saved.");
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Budget &amp; preferences
        </CardTitle>
        <CardDescription>
          Your monthly budget is derived from total starting funds spread across the budget period.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Derived monthly budget - shown prominently */}
        <div className="flex items-center gap-4 rounded-lg border border-border bg-secondary/40 p-4">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Wallet className="size-5" />
          </span>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Monthly budget
            </p>
            <p className="text-2xl font-semibold tnum text-foreground">
              {fmtMoney(derivedBudget, { cents: true })}
            </p>
            <p className="text-xs text-muted-foreground">
              {fmtMoney(funds || 0)} ÷ {Number.isFinite(months) && months > 0 ? months : "-"} months
            </p>
          </div>
        </div>

        <fieldset disabled={readOnly} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <Label htmlFor="currency">Currency</Label>
            <Input
              id="currency"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              placeholder="USD"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="starting_funds">Total starting funds</Label>
            <Input
              id="starting_funds"
              type="number"
              step="0.01"
              min="0"
              inputMode="decimal"
              value={startingFunds}
              onChange={(e) => setStartingFunds(e.target.value)}
              placeholder="0.00"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="budget_months">Budget period (months)</Label>
            <Input
              id="budget_months"
              type="number"
              step="1"
              min="1"
              inputMode="numeric"
              value={budgetMonths}
              onChange={(e) => setBudgetMonths(e.target.value)}
              placeholder="12"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="savings_target">Monthly savings target</Label>
            <Input
              id="savings_target"
              type="number"
              step="0.01"
              min="0"
              inputMode="decimal"
              value={savingsTarget}
              onChange={(e) => setSavingsTarget(e.target.value)}
              placeholder="0.00"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="arrival_date">Arrival date in the US</Label>
            <Input
              id="arrival_date"
              type="date"
              value={arrivalDate}
              onChange={(e) => setArrivalDate(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">Anchors your Yearly Journey. Leave blank to use your first transaction.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="birth_date">Date of birth</Label>
            <Input
              id="birth_date"
              type="date"
              value={birthDate}
              onChange={(e) => setBirthDate(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">Sets the debt-free deadline (your birthday at the target age).</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="debt_free_target_age">Debt-free by age</Label>
            <Input
              id="debt_free_target_age"
              type="number"
              step="1"
              min="1"
              inputMode="numeric"
              value={targetAge}
              onChange={(e) => setTargetAge(e.target.value)}
              placeholder="25"
            />
            <p className="text-xs text-muted-foreground">The age you want your true net worth to reach $0.</p>
          </div>
        </fieldset>
      </CardContent>
      <CardFooter className="justify-end border-t pt-6">
        <Button onClick={submit} disabled={pending || readOnly}>
          {pending ? "Saving…" : "Save settings"}
        </Button>
      </CardFooter>
    </Card>
  );
}
