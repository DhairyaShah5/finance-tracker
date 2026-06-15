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
import type { DebtorRow } from "@/lib/database.types";
import { createDebtor, updateDebtor, type DebtorInput } from "./actions";

export function DebtorDialog({
  open,
  onOpenChange,
  existing,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  existing?: DebtorRow | null;
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [name, setName] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [note, setNote] = React.useState("");

  React.useEffect(() => {
    if (!open) return;
    setName(existing?.name ?? "");
    setAmount(existing ? String(existing.amount) : "");
    setNote(existing?.note ?? "");
  }, [open, existing]);

  function submit() {
    if (!name.trim()) {
      toast.error("Name is required.");
      return;
    }
    const input: DebtorInput = { name: name.trim(), amount: amount || 0, note: note.trim() || null };
    start(async () => {
      const res = existing ? await updateDebtor(existing.id, input) : await createDebtor(input);
      if (!res.ok) {
        toast.error(res.error ?? "Failed to save.");
        return;
      }
      toast.success(existing ? "Debtor updated." : "Debtor added.");
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{existing ? "Edit debtor" : "Add debtor"}</DialogTitle>
          <DialogDescription>Track how much someone currently owes you.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="debtor-name">Name</Label>
            <Input
              id="debtor-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Vivek"
              autoComplete="off"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="debtor-amount">Amount owed</Label>
            <Input
              id="debtor-amount"
              type="number"
              step="0.01"
              min="0"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="debtor-note">Note</Label>
            <Textarea
              id="debtor-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="Optional"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending}>
            {pending ? "Saving…" : existing ? "Save changes" : "Add debtor"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
