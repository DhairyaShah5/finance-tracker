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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { hueColor } from "@/lib/format";
import type { CategoryRow, InflowTypeRow } from "@/lib/database.types";

const GROUP_NONE = "__none__";
type GroupValue = "needs" | "wants" | "savings" | null;
const asGroup = (v: string): GroupValue => (v === GROUP_NONE ? null : (v as GroupValue));
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
  const [pending, start] = React.useTransition();
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editName, setEditName] = React.useState("");
  const [editHue, setEditHue] = React.useState("250");
  const [editGroup, setEditGroup] = React.useState<string>(GROUP_NONE);
  const [newName, setNewName] = React.useState("");
  const [newHue, setNewHue] = React.useState("250");
  const [newGroup, setNewGroup] = React.useState<string>("needs");

  function beginEdit(c: CategoryRow) {
    setEditingId(c.id);
    setEditName(c.name);
    setEditHue(String(c.color_hue ?? 250));
    setEditGroup(c.budget_group ?? GROUP_NONE);
  }
  function cancelEdit() {
    setEditingId(null);
  }
  function saveEdit(id: string) {
    start(async () => {
      const res = await updateCategory(id, { name: editName, color_hue: editHue, budget_group: asGroup(editGroup) });
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
    if (!newName.trim()) {
      toast.error("Enter a category name.");
      return;
    }
    start(async () => {
      const res = await createCategory({ name: newName, color_hue: newHue, budget_group: asGroup(newGroup) });
      if (!res.ok) {
        toast.error(res.error ?? "Failed to add category.");
        return;
      }
      toast.success("Category added.");
      setNewName("");
      setNewHue("250");
      setNewGroup("needs");
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <Tag className="size-3.5" /> Categories
        </CardTitle>
        <CardDescription>Group your expenses and pick a swatch color for charts.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="divide-y divide-border rounded-lg border border-border">
          {categories.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              No categories yet — add your first below.
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
                  <Select value={editGroup} onValueChange={setEditGroup}>
                    <SelectTrigger className="h-8 w-28" aria-label="Budget group"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="needs">Needs</SelectItem>
                      <SelectItem value="wants">Wants</SelectItem>
                      <SelectItem value="savings">Savings</SelectItem>
                      <SelectItem value={GROUP_NONE}>Unclassified</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button size="icon" className="size-8" onClick={() => saveEdit(c.id)} disabled={pending}>
                    <Check className="size-4" />
                  </Button>
                  <Button size="icon" variant="ghost" className="size-8" onClick={cancelEdit} disabled={pending}>
                    <X className="size-4" />
                  </Button>
                </div>
              ) : (
                <div key={c.id} className="flex items-center gap-3 px-3 py-2">
                  <Swatch hue={c.color_hue} />
                  <span className="flex-1 truncate text-sm font-medium">{c.name}</span>
                  {c.budget_group ? (
                    <Badge variant="outline" className="text-[10px] capitalize">{c.budget_group}</Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px] text-muted-foreground">unclassified</Badge>
                  )}
                  <Button size="icon" variant="ghost" className="size-8" onClick={() => beginEdit(c)} disabled={pending}>
                    <Pencil className="size-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-8 text-muted-foreground hover:text-destructive"
                    onClick={() => remove(c)}
                    disabled={pending}
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
            <Label>Group</Label>
            <Select value={newGroup} onValueChange={setNewGroup}>
              <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="needs">Needs</SelectItem>
                <SelectItem value="wants">Wants</SelectItem>
                <SelectItem value="savings">Savings</SelectItem>
                <SelectItem value={GROUP_NONE}>Unclassified</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button onClick={add} disabled={pending} className="gap-1.5">
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
  const [pending, start] = React.useTransition();
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editName, setEditName] = React.useState("");
  const [editPaycheck, setEditPaycheck] = React.useState(false);
  const [newName, setNewName] = React.useState("");
  const [newPaycheck, setNewPaycheck] = React.useState(false);

  function beginEdit(i: InflowTypeRow) {
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
              No income types yet — add your first below.
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
                  <Button size="icon" className="size-8" onClick={() => saveEdit(i.id)} disabled={pending}>
                    <Check className="size-4" />
                  </Button>
                  <Button size="icon" variant="ghost" className="size-8" onClick={cancelEdit} disabled={pending}>
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
                  <Button size="icon" variant="ghost" className="size-8" onClick={() => beginEdit(i)} disabled={pending}>
                    <Pencil className="size-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-8 text-muted-foreground hover:text-destructive"
                    onClick={() => remove(i)}
                    disabled={pending}
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
          <Button onClick={add} disabled={pending} className="gap-1.5">
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
