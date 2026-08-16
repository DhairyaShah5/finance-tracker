"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fmtMoney } from "@/lib/format";
import { useReadOnly } from "@/components/read-only-context";
import {
  previewTransferImport,
  commitTransferImport,
  type ImportRow,
  type ImportAccountPreview,
} from "../actions";

const VIEW_ONLY = "View only - sign in to make changes.";

/** Accept either a JSON array of rows, or CSV lines: date,from,to,amount,note */
function parseRows(text: string): { rows: ImportRow[]; error?: string } {
  const t = text.trim();
  if (!t) return { rows: [] };
  if (t.startsWith("[")) {
    try {
      const arr = JSON.parse(t);
      if (!Array.isArray(arr)) return { rows: [], error: "JSON must be an array of rows." };
      return { rows: arr as ImportRow[] };
    } catch {
      return { rows: [], error: "That isn't valid JSON." };
    }
  }
  const rows: ImportRow[] = [];
  for (const line of t.split(/\r?\n/)) {
    const s = line.trim();
    if (!s || /^date\s*,/i.test(s)) continue; // skip blank lines / a header row
    const parts = s.split(",").map((p) => p.trim());
    if (parts.length < 4) return { rows: [], error: `Need date,from,to,amount on every line: "${s}"` };
    const [date, from, to, amount, ...noteParts] = parts;
    rows.push({ date, from, to, amount, note: noteParts.join(",") || null });
  }
  return { rows };
}

export function ImportView({ accountNames }: { accountNames: string[] }) {
  const router = useRouter();
  const readOnly = useReadOnly();
  const [text, setText] = React.useState("");
  const [preview, setPreview] = React.useState<ImportAccountPreview[] | null>(null);
  const [count, setCount] = React.useState(0);
  const [pending, start] = React.useTransition();

  const balancesHold = preview?.every((p) => Math.abs(p.balanceAfter - p.balanceBefore) < 0.005) ?? false;

  function onPreview() {
    const { rows, error } = parseRows(text);
    if (error) return void toast.error(error);
    if (!rows.length) return void toast.error("Paste some transfers first.");
    start(async () => {
      const res = await previewTransferImport(rows);
      if (!res.ok) {
        setPreview(null);
        return void toast.error(res.error ?? "Could not preview.");
      }
      setPreview(res.accounts ?? []);
      setCount(res.transfers ?? 0);
    });
  }

  function onCommit() {
    if (readOnly) return void toast.info(VIEW_ONLY);
    const { rows, error } = parseRows(text);
    if (error) return void toast.error(error);
    start(async () => {
      const res = await commitTransferImport(rows);
      if (!res.ok) return void toast.error(res.error ?? "Import failed.");
      toast.success(`Imported ${count} transfer${count === 1 ? "" : "s"}. Balances unchanged.`);
      setPreview(null);
      setText("");
      router.push("/accounts");
      router.refresh();
    });
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="space-y-1">
        <Link href="/accounts" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> Accounts
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Import transfers</h1>
        <p className="text-sm text-muted-foreground">
          Bulk-add transfers (chiefly card paydowns) reconstructed from bank statements. Each account&apos;s
          displayed balance is held exactly where it is; only the hidden opening balance is re-solved.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Paste rows</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={10}
            spellCheck={false}
            placeholder={`date,from,to,amount,note\n2025-09-12,BofA Checking,BofA Credit Card,306.21,BofA Card payment\n…or paste a JSON array of {date,from,to,amount,note}`}
            className="font-mono text-xs"
          />
          <p className="text-xs text-muted-foreground">
            Accounts (match by name): {accountNames.join(" · ")}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onPreview} disabled={pending || !text.trim()}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : null} Preview
            </Button>
            <Button onClick={onCommit} disabled={pending || !preview || !balancesHold} className="gap-1.5">
              <Upload className="size-4" /> Import{count ? ` ${count}` : ""}
            </Button>
          </div>
        </CardContent>
      </Card>

      {preview ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Preview {count} transfer{count === 1 ? "" : "s"}
              {balancesHold ? (
                <span className="ml-2 text-xs font-normal text-emerald-600 dark:text-emerald-500">balances unchanged ✓</span>
              ) : (
                <span className="ml-2 text-xs font-normal text-destructive">balances would change!</span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm tnum">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="py-2 pr-4 font-medium">Account</th>
                  <th className="py-2 pr-4 text-right font-medium">Balance now</th>
                  <th className="py-2 pr-4 text-right font-medium">Balance after</th>
                  <th className="py-2 pr-4 text-right font-medium">Opening now</th>
                  <th className="py-2 text-right font-medium">Opening after</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((p) => (
                  <tr key={p.account} className="border-b last:border-0">
                    <td className="py-2 pr-4">{p.account}</td>
                    <td className="py-2 pr-4 text-right">{fmtMoney(p.balanceBefore, { cents: true })}</td>
                    <td className="py-2 pr-4 text-right font-medium">{fmtMoney(p.balanceAfter, { cents: true })}</td>
                    <td className="py-2 pr-4 text-right text-muted-foreground">{fmtMoney(p.openingBefore, { cents: true })}</td>
                    <td className="py-2 text-right">{fmtMoney(p.openingAfter, { cents: true })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
