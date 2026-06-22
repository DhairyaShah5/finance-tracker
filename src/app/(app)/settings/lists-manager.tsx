"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Pencil, Plus, Tag, Trash2, Wallet, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useReadOnly } from "@/components/read-only-context";
import { fmtMoney, hueColor } from "@/lib/format";
import type { CategoryRow, InflowTypeRow } from "@/lib/database.types";

const VIEW_ONLY = "View only - sign in to make changes.";
import {
  createCategory,
  createInflowType,
  deleteCategory,
  deleteInflowType,
  updateCategory,
  updateInflowType,
} from "./actions";

function Swatch({ hue }: { hue: number | null }) {
  return (
    <span
      className="size-4 shrink-0 rounded-full ring-1 ring-border"
      style={{ background: hueColor(hue) }}
      aria-hidden
    />
  );
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------
function CategoriesSection({ categories }: { categories: CategoryRow[] }) {
  const router = useRouter();
  const readOnly = useReadOnly();
  const [pending, start] = React.useTransition();
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editName, setEditName] = React.useState("");
  const [editHue, setEditHue] = React.useState("250");
  const [editBudget, setEditBudget] = React.useState("");
  const [newName, setNewName] = React.useState("");
  const [newHue, setNewHue] = React.useState("250");
  const [newBudget, setNewBudget] = React.useState("");

  const toBudget = (v: string) => (v.trim() === "" ? null : Number(v));

  function beginEdit(c: CategoryRow) {
    if (readOnly) return void toast.info(VIEW_ONLY);
    setEditingId(c.id);
    setEditName(c.name);
    setEditHue(String(c.color_hue ?? 250));
    setEditBudget(c.monthly_budget != null ? String(c.monthly_budget) : "");
  }
  function cancelEdit() {
    setEditingId(null);
  }
  function saveEdit(id: string) {
    start(async () => {
      const res = await updateCategory(id, { name: editName, color_hue: editHue, monthly_budget: toBudget(editBudget) });
      if (!res.ok) {
        toast.error(res.error ?? "Failed to update category.");
        return;
      }
      toast.success("Category updated.");
      setEditingId(null);
      router.refresh();
    });
  }
  function remove(c: CategoryRow) {
    if (readOnly) return void toast.info(VIEW_ONLY);
    if (!window.confirm(`Delete "${c.name}"? Transactions keep their history but become uncategorized.`)) return;
    start(async () => {
      const res = await deleteCategory(c.id);
      if (!res.ok) {
        toast.error(res.error ?? "Failed to delete category.");
        return;
      }
      toast.success("Category deleted.");
      router.refresh();
    });
  }
  function add() {
    if (readOnly) return void toast.info(VIEW_ONLY);
    if (!newName.trim()) {
      toast.error("Enter a category name.");
      return;
    }
    start(async () => {
      const res = await createCategory({ name: newName, color_hue: newHue, monthly_budget: toBudget(newBudget) });
      if (!res.ok) {
        toast.error(res.error ?? "Failed to add category.");
        return;
      }
      toast.success("Category added.");
      setNewName("");
      setNewHue("250");
      setNewBudget("");
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <Tag className="size-3.5" /> Categories
        </CardTitle>
        <CardDescription>
          Name each category, pick a swatch color, and optionally pin a monthly budget. Leave the
          budget blank to auto-adapt it to your recent spending. Needs / Wants / Savings is set per
          transaction.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="divide-y divide-border rounded-lg border border-border">
          {categories.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              No categories yet. Add your first below.
            </p>
          ) : (
            categories.map((c) =>
              editingId === c.id ? (
                <div key={c.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                  <Swatch hue={Number(editHue)} />
                  <Input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="h-8 flex-1 min-w-40"
                    aria-label="Category name"
                  />
                  <Input
                    type="number"
                    min="0"
                    max="360"
                    value={editHue}
                    onChange={(e) => setEditHue(e.target.value)}
                    className="h-8 w-20"
                    aria-label="Color hue"
                  />
                  <Input
                    type="number"
                    min="0"
                    inputMode="decimal"
                    value={editBudget}
                    onChange={(e) => setEditBudget(e.target.value)}
                    className="h-8 w-24"
                    placeholder="auto"
                    aria-label="Monthly budget"
                  />
                  <Button size="icon" className="size-8" onClick={() => saveEdit(c.id)} disabled={pending || readOnly}>
                    <Check className="size-4" />
                  </Button>
                  <Button size="icon" variant="ghost" className="size-8" onClick={cancelEdit} disabled={pending || readOnly}>
                    <X className="size-4" />
                  </Button>
                </div>
              ) : (
                <div key={c.id} className="flex items-center gap-3 px-3 py-2">
                  <Swatch hue={c.color_hue} />
                  <span className="flex-1 truncate text-sm font-medium">{c.name}</span>
                  {c.monthly_budget != null ? (
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                      {fmtMoney(c.monthly_budget)}/mo
                    </span>
                  ) : null}
                  <Button size="icon" variant="ghost" className="size-8" onClick={() => beginEdit(c)} disabled={pending || readOnly}>
                    <Pencil className="size-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-8 text-muted-foreground hover:text-destructive"
                    onClick={() => remove(c)}
                    disabled={pending || readOnly}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ),
            )
          )}
        </div>

        {/* Add row */}
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex-1 space-y-1.5 min-w-40">
            <Label htmlFor="new-cat-name">New category</Label>
            <Input
              id="new-cat-name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Subscriptions"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-cat-hue" className="flex items-center gap-1.5">
              Hue <Swatch hue={Number(newHue)} />
            </Label>
            <Input
              id="new-cat-hue"
              type="number"
              min="0"
              max="360"
              value={newHue}
              onChange={(e) => setNewHue(e.target.value)}
              className="w-24"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-cat-budget">Budget/mo</Label>
            <Input
              id="new-cat-budget"
              type="number"
              min="0"
              inputMode="decimal"
              value={newBudget}
              onChange={(e) => setNewBudget(e.target.value)}
              className="w-24"
              placeholder="auto"
            />
          </div>
          <Button onClick={add} disabled={pending || readOnly} className="gap-1.5">
            <Plus className="size-4" /> Add
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Inflow types
// ---------------------------------------------------------------------------
function InflowTypesSection({ inflowTypes }: { inflowTypes: InflowTypeRow[] }) {
  const router = useRouter();
  const readOnly = useReadOnly();
  const [pending, start] = React.useTransition();
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editName, setEditName] = React.useState("");
  const [editPaycheck, setEditPaycheck] = React.useState(false);
  const [newName, setNewName] = React.useState("");
  const [newPaycheck, setNewPaycheck] = React.useState(false);

  function beginEdit(i: InflowTypeRow) {
    if (readOnly) return void toast.info(VIEW_ONLY);
    setEditingId(i.id);
    setEditName(i.name);
    setEditPaycheck(i.is_paycheck);
  }
  function cancelEdit() {
    setEditingId(null);
  }
  function saveEdit(id: string) {
    start(async () => {
      const res = await updateInflowType(id, { name: editName, is_paycheck: editPaycheck });
      if (!res.ok) {
        toast.error(res.error ?? "Failed to update income type.");
        return;
      }
      toast.success("Income type updated.");
      setEditingId(null);
      router.refresh();
    });
  }
  function remove(i: InflowTypeRow) {
    if (readOnly) return void toast.info(VIEW_ONLY);
    if (!window.confirm(`Delete "${i.name}"? Existing income keeps its history but loses this type.`)) return;
    start(async () => {
      const res = await deleteInflowType(i.id);
      if (!res.ok) {
        toast.error(res.error ?? "Failed to delete income type.");
        return;
      }
      toast.success("Income type deleted.");
      router.refresh();
    });
  }
  function add() {
    if (readOnly) return void toast.info(VIEW_ONLY);
    if (!newName.trim()) {
      toast.error("Enter an income type name.");
      return;
    }
    start(async () => {
      const res = await createInflowType({ name: newName, is_paycheck: newPaycheck });
      if (!res.ok) {
        toast.error(res.error ?? "Failed to add income type.");
        return;
      }
      toast.success("Income type added.");
      setNewName("");
      setNewPaycheck(false);
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <Wallet className="size-3.5" /> Income types
        </CardTitle>
        <CardDescription>Label your inflows. Flag the ones that are paychecks.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="divide-y divide-border rounded-lg border border-border">
          {inflowTypes.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              No income types yet. Add your first below.
            </p>
          ) : (
            inflowTypes.map((i) =>
              editingId === i.id ? (
                <div key={i.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                  <Input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="h-8 flex-1 min-w-40"
                    aria-label="Income type name"
                  />
                  <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Switch checked={editPaycheck} onCheckedChange={setEditPaycheck} />
                    Paycheck
                  </label>
                  <Button size="icon" className="size-8" onClick={() => saveEdit(i.id)} disabled={pending || readOnly}>
                    <Check className="size-4" />
                  </Button>
                  <Button size="icon" variant="ghost" className="size-8" onClick={cancelEdit} disabled={pending || readOnly}>
                    <X className="size-4" />
                  </Button>
                </div>
              ) : (
                <div key={i.id} className="flex items-center gap-3 px-3 py-2">
                  <span className="flex-1 truncate text-sm font-medium">{i.name}</span>
                  {i.is_paycheck ? (
                    <Badge variant="outline" className="text-[10px]">
                      Paycheck
                    </Badge>
                  ) : null}
                  <Button size="icon" variant="ghost" className="size-8" onClick={() => beginEdit(i)} disabled={pending || readOnly}>
                    <Pencil className="size-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-8 text-muted-foreground hover:text-destructive"
                    onClick={() => remove(i)}
                    disabled={pending || readOnly}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ),
            )
          )}
        </div>

        {/* Add row */}
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 space-y-1.5 min-w-40">
            <Label htmlFor="new-inflow-name">New income type</Label>
            <Input
              id="new-inflow-name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Bonus"
            />
          </div>
          <label className="flex h-9 items-center gap-2 text-sm text-muted-foreground">
            <Switch checked={newPaycheck} onCheckedChange={setNewPaycheck} />
            Paycheck
          </label>
          <Button onClick={add} disabled={pending || readOnly} className="gap-1.5">
            <Plus className="size-4" /> Add
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function ListsManager({
  categories,
  inflowTypes,
}: {
  categories: CategoryRow[];
  inflowTypes: InflowTypeRow[];
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <CategoriesSection categories={categories} />
      <InflowTypesSection inflowTypes={inflowTypes} />
    </div>
  );
}
