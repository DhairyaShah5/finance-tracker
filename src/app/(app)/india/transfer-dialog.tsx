"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { fmtNumber } from "@/lib/format";
import type { IndiaTransferRow } from "@/lib/database.types";
import { createTransfer, updateTransfer, type TransferInput } from "./actions";

const today = () => new Date().toISOString().slice(0, 10);

export function TransferDialog({
  open,
  onOpenChange,
  existing,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  existing?: IndiaTransferRow | null;
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();

  const [direction, setDirection] = React.useState<"received" | "sent">("received");
  const [date, setDate] = React.useState(today());
  const [description, setDescription] = React.useState("");
  const [endpoint, setEndpoint] = React.useState("");
  const [usd, setUsd] = React.useState("");
  const [inr, setInr] = React.useState("");
  const [notes, setNotes] = React.useState("");

  // Hydrate form when opening.
  React.useEffect(() => {
    if (!open) return;
    if (existing) {
      setDirection(existing.direction);
      setDate(existing.transfer_date);
      setDescription(existing.description);
      setEndpoint(existing.endpoint ?? "");
      setUsd(String(existing.usd_amount));
      setInr(String(existing.inr_amount));
      setNotes(existing.notes ?? "");
    } else {
      setDirection("received");
      setDate(today());
      setDescription("");
      setEndpoint("");
      setUsd("");
      setInr("");
      setNotes("");
    }
  }, [open, existing]);

  // Live preview of the effective FX rate (INR per USD).
  const usdNum = Number(usd);
  const inrNum = Number(inr);
  const previewRate = usdNum > 0 && inrNum > 0 ? inrNum / usdNum : null;

  function submit() {
    const input: TransferInput = {
      transfer_date: date,
      direction,
      description,
      endpoint: endpoint || null,
      usd_amount: usd,
      inr_amount: inr,
      notes: notes || null,
    };
    start(async () => {
      const res = existing
        ? await updateTransfer(existing.id, input)
        : await createTransfer(input);
      if (!res.ok) {
        toast.error(res.error ?? "Failed to save.");
        return;
      }
      toast.success(existing ? "Transfer updated." : "Transfer added.");
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{existing ? "Edit transfer" : "Add transfer"}</DialogTitle>
          <DialogDescription>Record a USD↔INR transfer to or from India.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Tabs value={direction} onValueChange={(v) => setDirection(v as "received" | "sent")}>
            <TabsList className="w-full">
              <TabsTrigger value="received" className="flex-1">Received</TabsTrigger>
              <TabsTrigger value="sent" className="flex-1">Sent</TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="date">Date</Label>
              <Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="endpoint">Endpoint</Label>
              <Input
                id="endpoint"
                value={endpoint}
                onChange={(e) => setEndpoint(e.target.value)}
                placeholder="e.g. To Dixit"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="desc">Description</Label>
            <Input
              id="desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Wise transfer"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="usd">USD amount</Label>
              <Input
                id="usd"
                type="number"
                step="0.01"
                min="0"
                inputMode="decimal"
                value={usd}
                onChange={(e) => setUsd(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inr">INR amount</Label>
              <Input
                id="inr"
                type="number"
                step="0.01"
                min="0"
                inputMode="decimal"
                value={inr}
                onChange={(e) => setInr(e.target.value)}
                placeholder="0.00"
              />
            </div>
          </div>

          <div className="rounded-md border border-border bg-secondary/40 px-3 py-2 text-xs text-muted-foreground">
            Effective rate:{" "}
            <span className="font-medium tnum text-foreground">
              {previewRate !== null ? `${fmtNumber(previewRate, 2)} ₹/$` : "-"}
            </span>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending}>
            {pending ? "Saving…" : existing ? "Save changes" : "Add transfer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
