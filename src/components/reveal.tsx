import { cn } from "@/lib/utils";

/**
 * Lightweight entrance animation (fade + rise) via tw-animate-css — no JS.
 * Pass an incrementing `delay` to stagger a grid of cards.
 */
export function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  return (
    <div
      className={cn("animate-in fade-in-0 slide-in-from-bottom-3 duration-500 ease-out", className)}
      style={{ animationDelay: `${delay}ms`, animationFillMode: "both" }}
    >
      {children}
    </div>
  );
}
