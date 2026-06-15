import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface StatCardProps {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: React.ReactNode;
  accent?: "default" | "positive" | "negative";
  className?: string;
  /** Override the icon chip background (defaults to the brand gradient). */
  iconClassName?: string;
  /** When provided, the tile becomes a button that opens a breakdown. */
  onClick?: () => void;
}

/** Compact KPI tile used across the dashboard and feature pages. */
export function StatCard({
  label,
  value,
  hint,
  icon,
  accent = "default",
  className,
  iconClassName,
  onClick,
}: StatCardProps) {
  const interactive = !!onClick;
  return (
    <Card
      className={cn(
        "group relative h-full gap-0 overflow-hidden py-0 surface hover-lift",
        interactive && "cursor-pointer hover:border-ring/60",
        className,
      )}
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
      {/* faint brand wash that warms on hover */}
      <div
        className="pointer-events-none absolute -right-8 -top-10 size-28 rounded-full grad-brand opacity-[0.07] blur-2xl transition-opacity duration-300 group-hover:opacity-20"
        aria-hidden
      />
      <CardContent className="relative flex h-full flex-col gap-1.5 p-4 sm:p-5">
        <div className="flex min-h-9 items-start justify-between gap-2">
          <span className="text-[0.7rem] font-medium uppercase leading-tight tracking-wider text-muted-foreground">
            {label}
          </span>
          {icon ? (
            <span
              className={cn(
                "flex size-9 shrink-0 items-center justify-center rounded-xl text-white shadow-sm shadow-primary/30 transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-3 [&_svg]:size-4",
                iconClassName ?? "grad-brand",
              )}
            >
              {icon}
            </span>
          ) : null}
        </div>
        <div
          className={cn(
            "mt-auto text-2xl font-semibold tracking-tight tnum sm:text-[1.7rem]",
            accent === "positive" && "text-positive",
            accent === "negative" && "text-negative",
          )}
        >
          {value}
        </div>
        <div className="min-h-4 text-xs text-muted-foreground">{hint}</div>
      </CardContent>
    </Card>
  );
}
