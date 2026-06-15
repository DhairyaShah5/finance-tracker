import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface StatCardProps {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: React.ReactNode;
  accent?: "default" | "positive" | "negative";
  className?: string;
  /** When provided, the tile becomes a button that opens a breakdown. */
  onClick?: () => void;
}

/** Compact KPI tile used across the dashboard and feature pages. */
export function StatCard({ label, value, hint, icon, accent = "default", className, onClick }: StatCardProps) {
  const interactive = !!onClick;
  return (
    <Card
      className={cn("gap-0 py-0", interactive && "cursor-pointer transition-colors hover:border-ring/60 hover:bg-muted/40", className)}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={onClick}
      onKeyDown={
        interactive
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick?.();
              }
            }
          : undefined
      }
    >
      <CardContent className="flex flex-col gap-1.5 p-4">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </span>
          {icon ? <span className="text-muted-foreground">{icon}</span> : null}
        </div>
        <div
          className={cn(
            "text-2xl font-semibold tnum",
            accent === "positive" && "text-positive",
            accent === "negative" && "text-negative",
          )}
        >
          {value}
        </div>
        {hint ? <div className="text-xs text-muted-foreground">{hint}</div> : null}
      </CardContent>
    </Card>
  );
}
