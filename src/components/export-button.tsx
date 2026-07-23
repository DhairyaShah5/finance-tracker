"use client";

import * as React from "react";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/**
 * Downloads the full dataset as an .xlsx from the /export route. Owner-only
 * (the route rejects read-only viewers), so this is only rendered for the owner.
 */
export function ExportButton() {
  const [loading, setLoading] = React.useState(false);

  async function download() {
    if (loading) return;
    setLoading(true);
    try {
      const res = await fetch("/export");
      if (!res.ok) throw new Error(`Export failed (${res.status})`);
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const filename = disposition.match(/filename="([^"]+)"/)?.[1] ?? "finance-tracker.xlsx";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success("Workbook downloaded.");
    } catch {
      toast.error("Couldn't build the export. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      variant="ghost"
      onClick={download}
      disabled={loading}
      className="w-full justify-start gap-3 px-3 text-muted-foreground hover:text-foreground"
    >
      {loading ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
      {loading ? "Preparing…" : "Export to Excel"}
    </Button>
  );
}
