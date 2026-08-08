"use client";

import * as React from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowDownRight,
  ArrowUpRight,
  Award,
  Banknote,
  Briefcase,
  CalendarDays,
  Coins,
  Flag,
  HandCoins,
  LineChart,
  MapPin,
  PartyPopper,
  PiggyBank,
  Plane,
  Scale,
  Sparkles,
  Target,
  TrendingUp,
  Trophy,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { CountUp } from "@/components/count-up";
import { Reveal } from "@/components/reveal";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { fmtDate, fmtMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { DebtFreeGoal, Journey, JourneyYear, Milestone, MilestoneKind, NetWorthPoint } from "@/lib/journey";

const AXIS = { stroke: "var(--muted-foreground)", fontSize: 11, tickLine: false, axisLine: false };
const moneyTick = (v: number) => fmtMoney(v, { cents: false });
const YEAR_TINT = ["var(--chart-2)", "var(--chart-1)", "var(--chart-5)", "var(--chart-3)", "var(--chart-4)"];
const tintOf = (year: number) => YEAR_TINT[(year - 1) % YEAR_TINT.length];

// --- Contained confetti burst (fires once for a fresh chapter) --------------

function Confetti() {
  const pieces = React.useMemo(
    () =>
      Array.from({ length: 30 }, (_, i) => ({
        left: Math.random() * 100,
        delay: Math.random() * 1.4,
        dur: 2.4 + Math.random() * 2,
        color: ["var(--brand-1)", "var(--brand-2)", "var(--brand-3)", "var(--chart-2)", "var(--chart-5)"][i % 5],
        w: 5 + Math.random() * 5,
        rot: Math.random() * 360,
      })),
    [],
  );
  const [on, setOn] = React.useState(true);
  React.useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setOn(false);
      return;
    }
    const t = setTimeout(() => setOn(false), 6500);
    return () => clearTimeout(t);
  }, []);
  if (!on) return null;
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {pieces.map((p, i) => (
        <span
          key={i}
          className="absolute top-0 animate-confetti rounded-[2px]"
          style={{
            left: `${p.left}%`,
            width: p.w,
            height: p.w * 1.5,
            background: p.color,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.dur}s`,
            transform: `rotate(${p.rot}deg)`,
          }}
        />
      ))}
    </div>
  );
}

// --- Net-worth journey chart ------------------------------------------------

function JourneyTip({ active, payload }: { active?: boolean; payload?: Array<{ payload?: NetWorthPoint }> }) {
  if (!active || !payload?.length) return null;
  const p = payload[0]?.payload;
  if (!p) return null;
  return (
    <div className="min-w-44 rounded-xl border border-border/70 bg-popover/85 px-3 py-2 text-xs shadow-xl backdrop-blur-md">
      <p className="mb-1.5 font-semibold">{p.fullLabel}</p>
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className="size-2.5 rounded-full" style={{ background: "var(--chart-2)" }} />
          <span className="text-muted-foreground">Net worth</span>
          <span className="ml-auto font-semibold tnum">{fmtMoney(p.netWorth, { cents: true })}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="size-2.5 rounded-full" style={{ background: "var(--negative)" }} />
          <span className="text-muted-foreground">Debt owed home</span>
          <span className="ml-auto font-semibold tnum text-negative">{fmtMoney(-p.debt, { cents: true })}</span>
        </div>
        <div className="mt-0.5 flex items-center gap-2 border-t border-border/60 pt-1">
          <span className="text-muted-foreground">Net position</span>
          <span className={cn("ml-auto font-semibold tnum", p.trueNetWorth < 0 && "text-negative")}>
            {fmtMoney(p.trueNetWorth, { cents: true })}
          </span>
        </div>
      </div>
    </div>
  );
}

function JourneyChart({
  points,
  boundaries,
}: {
  points: NetWorthPoint[];
  boundaries: { month: string; year: number }[];
}) {
  const monthToLabel = new Map(points.map((p) => [p.month, p.label]));
  // Debt sits BELOW zero (you owe it); net worth above. Keep 0 in view as the divider.
  const data = points.map((p) => ({ ...p, debtNeg: -p.debt }));
  const vals = data.flatMap((p) => [p.netWorth, p.debtNeg]);
  const rawLo = Math.min(0, ...vals);
  const rawHi = Math.max(0, ...vals);
  const pad = Math.max(500, (rawHi - rawLo) * 0.08);
  const domain: [number, number] = [Math.floor(rawLo - pad), Math.ceil(rawHi + pad)];
  return (
    <ResponsiveContainer width="100%" height="100%" minHeight={340}>
      <AreaChart data={data} margin={{ top: 18, right: 12, left: 4, bottom: 0 }}>
        <defs>
          <linearGradient id="grad-nw" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-2)" stopOpacity={0.35} />
            <stop offset="100%" stopColor="var(--chart-2)" stopOpacity={0.03} />
          </linearGradient>
          <linearGradient id="grad-debt" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--negative)" stopOpacity={0.04} />
            <stop offset="100%" stopColor="var(--negative)" stopOpacity={0.32} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="4 4" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="month" tickFormatter={(m: string) => monthToLabel.get(m) ?? m} minTickGap={14} {...AXIS} dy={4} />
        <YAxis {...AXIS} width={56} tickFormatter={moneyTick} tickCount={9} domain={domain} />
        <Tooltip cursor={{ stroke: "var(--border)", strokeWidth: 1 }} content={<JourneyTip />} />
        {/* Zero divider: own above, owe below. */}
        <ReferenceLine y={0} stroke="var(--muted-foreground)" strokeOpacity={0.5} strokeDasharray="2 3" />
        {boundaries.map((b) => (
          <ReferenceLine
            key={b.month}
            x={b.month}
            stroke="var(--primary)"
            strokeDasharray="4 4"
            strokeOpacity={0.6}
            label={{ value: `Yr ${b.year}`, position: "insideTopRight", fill: "var(--primary)", fontSize: 10, fontWeight: 600 }}
          />
        ))}
        {/* Debt owed home, drawn below zero. Debt free is when net position reaches 0. */}
        <Area
          type="monotone"
          dataKey="debtNeg"
          name="Debt"
          stroke="var(--negative)"
          strokeWidth={2.5}
          fill="url(#grad-debt)"
          baseValue={0}
          dot={false}
          activeDot={{ r: 5, strokeWidth: 2, stroke: "var(--background)" }}
          animationDuration={1000}
        />
        {/* What you own, above zero. */}
        <Area
          type="monotone"
          dataKey="netWorth"
          name="Net worth"
          stroke="var(--chart-2)"
          strokeWidth={2.5}
          fill="url(#grad-nw)"
          baseValue={0}
          dot={false}
          activeDot={{ r: 5, strokeWidth: 2, stroke: "var(--background)" }}
          animationDuration={1000}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// --- Milestone timeline -----------------------------------------------------

const MILESTONE_META: Record<MilestoneKind, { icon: typeof Plane; tint: string }> = {
  arrival: { icon: Plane, tint: "var(--chart-3)" },
  income: { icon: Banknote, tint: "var(--chart-2)" },
  job: { icon: Briefcase, tint: "var(--chart-1)" },
  invest: { icon: LineChart, tint: "var(--chart-4)" },
  trip: { icon: MapPin, tint: "var(--chart-5)" },
  networth: { icon: TrendingUp, tint: "var(--chart-2)" },
  debtfree: { icon: Award, tint: "var(--positive)" },
  anniversary: { icon: Flag, tint: "var(--primary)" },
  peak: { icon: Trophy, tint: "var(--chart-5)" },
};

function Timeline({ milestones }: { milestones: Milestone[] }) {
  if (!milestones.length) {
    return <p className="py-6 text-center text-sm text-muted-foreground">No milestones recorded yet.</p>;
  }
  return (
    <ol className="relative ml-3 space-y-5 border-l border-border/70 pl-6">
      {milestones.map((m, i) => {
        const meta = MILESTONE_META[m.kind];
        const Icon = meta.icon;
        return (
          <li
            key={`${m.date}-${i}`}
            className="relative animate-in fade-in-0 slide-in-from-left-2"
            style={{ animationDelay: `${i * 70}ms`, animationFillMode: "both", animationDuration: "480ms" }}
          >
            <span
              className="absolute -left-[35px] flex size-6 items-center justify-center rounded-full text-white shadow-sm ring-4 ring-card [&_svg]:size-3.5"
              style={{ background: meta.tint }}
            >
              <Icon />
            </span>
            <div className="flex flex-wrap items-baseline gap-x-2">
              <p className="text-sm font-semibold">{m.title}</p>
              {m.amount != null ? (
                <span className="text-sm font-semibold tnum" style={{ color: meta.tint }}>
                  {fmtMoney(m.amount)}
                </span>
              ) : null}
            </div>
            <p className="text-xs text-muted-foreground">
              {fmtDate(m.date, "long")}
              {m.detail ? ` · ${m.detail}` : ""}
            </p>
          </li>
        );
      })}
    </ol>
  );
}

// --- Year-in-review card ----------------------------------------------------

function YearStat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border/60 bg-secondary/30 px-3 py-2">
      <p className="text-[0.65rem] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-semibold tnum">{children}</p>
    </div>
  );
}

function YearCard({ y }: { y: JourneyYear }) {
  const tint = tintOf(y.year);
  const active = y.months > 0 || y.income > 0 || y.spending > 0;
  const up = y.growth >= 0;
  const Arrow = up ? ArrowUpRight : ArrowDownRight;

  return (
    <Card className="surface hover-lift overflow-hidden py-0">
      <div className="h-1 w-full" style={{ background: tint }} aria-hidden />
      <CardContent className="flex flex-col gap-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-bold tracking-tight">{y.label}</h3>
              {y.isCurrent ? (
                <Badge className="animate-pulse-ring border-0 text-white" style={{ background: tint }}>
                  In progress
                </Badge>
              ) : null}
            </div>
            <p className="text-xs text-muted-foreground">
              {fmtDate(y.startISO, "medium")} to {fmtDate(y.endISO, "medium")} · {y.days} days
            </p>
          </div>
          <div className="text-right">
            <p className="text-[0.65rem] font-medium uppercase tracking-wider text-muted-foreground">Net worth</p>
            <p className="text-sm font-semibold tnum">
              {fmtMoney(y.startNetWorth)} → {fmtMoney(y.endNetWorth)}
            </p>
            <p className={cn("flex items-center justify-end gap-0.5 text-sm font-semibold", up ? "text-positive" : "text-negative")}>
              <Arrow className="size-3.5" />
              <CountUp value={y.growth} sign />
              {y.growthPct != null ? (
                <span className="text-xs opacity-80"> ({y.growthPct >= 0 ? "+" : ""}{y.growthPct}%)</span>
              ) : null}
            </p>
            <p className="mt-1 text-[0.7rem] text-muted-foreground">
              True:{" "}
              <span className={cn("tnum font-medium", y.trueEndNetWorth < 0 ? "text-negative" : "text-foreground/80")}>
                {fmtMoney(y.trueStartNetWorth)} → {fmtMoney(y.trueEndNetWorth)}
              </span>
            </p>
          </div>
        </div>

        {active ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <YearStat label="Earned">
              <span className="text-positive">{fmtMoney(y.income)}</span>
            </YearStat>
            <YearStat label="Spent">
              <span className="text-negative">{fmtMoney(y.spending)}</span>
            </YearStat>
            <YearStat label="Saved">{fmtMoney(y.saved)}</YearStat>
            <YearStat label="Kept from income">
              <span className={y.net >= 0 ? "text-positive" : "text-negative"}>{fmtMoney(y.net, { sign: true })}</span>
            </YearStat>
            <YearStat label="Savings rate">{y.savingsRate != null ? `${y.savingsRate}%` : "n/a"}</YearStat>
            <YearStat label="From India (net)">
              {y.indiaNetUsd !== 0 ? fmtMoney(y.indiaNetUsd, { sign: true }) : "n/a"}
            </YearStat>
            {y.topCategory ? (
              <div className="col-span-2 rounded-lg border border-border/60 bg-secondary/30 px-3 py-2 sm:col-span-3">
                <p className="text-[0.65rem] font-medium uppercase tracking-wider text-muted-foreground">
                  Biggest spend category
                </p>
                <p className="mt-0.5 flex items-center justify-between text-sm font-semibold">
                  <span>{y.topCategory.name}</span>
                  <span className="tnum">{fmtMoney(y.topCategory.total)}</span>
                </p>
              </div>
            ) : null}
            <p className="col-span-2 text-[0.7rem] leading-relaxed text-muted-foreground sm:col-span-3">
              Kept from income is what you earned minus what you spent, and the savings rate is that share of your income.
              Investing and family transfers move your net worth on top of that, so amounts invested can be larger than what you kept from income.
            </p>
          </div>
        ) : (
          <div className="flex items-center gap-3 rounded-lg border border-dashed border-border bg-secondary/20 px-4 py-5">
            <span className="flex size-9 items-center justify-center rounded-xl text-white [&_svg]:size-4" style={{ background: tint }}>
              <Sparkles />
            </span>
            <div>
              <p className="text-sm font-medium">{y.label} is just beginning</p>
              <p className="text-xs text-muted-foreground">
                {y.days === 1 ? "Day one." : `${y.days} days in.`} Your story for this year is still being written.
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// --- Debt-free goal ---------------------------------------------------------

function CountdownUnit({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex min-w-16 flex-col items-center rounded-xl bg-secondary/60 px-3 py-2">
      <span className="text-2xl font-bold tabular-nums sm:text-3xl">{String(value).padStart(2, "0")}</span>
      <span className="text-[0.6rem] font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
    </div>
  );
}

/** Live countdown to the deadline. Ticks client-side; a server-safe fallback
 *  (days only) renders first to avoid a hydration mismatch. */
function Countdown({ deadlineISO, fallbackDays }: { deadlineISO: string; fallbackDays: number }) {
  const [now, setNow] = React.useState<number | null>(null);
  React.useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  let days = Math.max(0, fallbackDays);
  let hours = 0;
  let mins = 0;
  let secs = 0;
  if (now != null) {
    let diff = Math.max(0, new Date(`${deadlineISO}T00:00:00`).getTime() - now);
    days = Math.floor(diff / 86_400_000);
    diff -= days * 86_400_000;
    hours = Math.floor(diff / 3_600_000);
    diff -= hours * 3_600_000;
    mins = Math.floor(diff / 60_000);
    diff -= mins * 60_000;
    secs = Math.floor(diff / 1000);
  }
  return (
    <div className="flex flex-wrap gap-2">
      <CountdownUnit value={days} label="Days" />
      <CountdownUnit value={hours} label="Hours" />
      <CountdownUnit value={mins} label="Min" />
      <CountdownUnit value={secs} label="Sec" />
    </div>
  );
}

const STATUS_META: Record<DebtFreeGoal["status"], { label: string; tint: string }> = {
  debtfree: { label: "Debt free", tint: "var(--positive)" },
  ahead: { label: "Ahead of schedule", tint: "var(--positive)" },
  on_track: { label: "On track", tint: "var(--chart-3)" },
  behind: { label: "Behind", tint: "var(--warning)" },
  off_track: { label: "Off track", tint: "var(--negative)" },
  overdue: { label: "Past deadline", tint: "var(--negative)" },
};

/** Whole months between two ISO dates (for "X months early"). */
function monthsBetween(fromISO: string, toISO: string): number {
  return Math.round(
    (new Date(`${toISO}T00:00:00`).getTime() - new Date(`${fromISO}T00:00:00`).getTime()) / (86_400_000 * 30.4375),
  );
}

function verdict(goal: DebtFreeGoal): string {
  const need = fmtMoney(goal.requiredMonthly);
  const saving = goal.actualMonthly == null ? "n/a" : fmtMoney(goal.actualMonthly, { sign: true });
  const by = goal.projectedISO ? fmtDate(goal.projectedISO, "medium") : null;
  const early = goal.projectedISO ? monthsBetween(goal.projectedISO, goal.deadlineISO) : 0;
  const noBorrow = "assuming no further borrowing";
  switch (goal.status) {
    case "off_track":
      return `You are saving about ${saving} a month, so nothing is going toward the debt yet. You need about ${need}/month to reach $0 by ${fmtDate(goal.deadlineISO, "medium")}.`;
    case "behind":
      return `You are saving about ${saving}/month, but need ${need}/month. At that rate, ${noBorrow}, you would be debt free around ${by}, after your ${goal.targetAge}th birthday.`;
    case "ahead":
      return `You are saving about ${saving}/month, more than the ${need}/month you need. At that rate, ${noBorrow}, you would be debt free around ${by}, about ${early} month${early === 1 ? "" : "s"} before your ${goal.targetAge}th birthday.`;
    case "on_track":
      return `You are saving about ${saving}/month, right around the ${need}/month you need. At that rate, ${noBorrow}, you would clear the debt around ${by}, close to your ${goal.targetAge}th birthday.`;
    case "overdue":
      return `Your ${goal.targetAge}th birthday has passed with ${fmtMoney(goal.gap)} still to go. Adjust the target in Settings.`;
    default:
      return "";
  }
}

function DebtFreeGoalCard({ goal }: { goal: DebtFreeGoal }) {
  const meta = STATUS_META[goal.status];
  const done = goal.status === "debtfree";
  return (
    <Card className="surface overflow-hidden">
      <CardContent className="flex flex-col gap-5 p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl grad-brand text-white shadow-sm shadow-primary/30 [&_svg]:size-5">
              <Target />
            </span>
            <div>
              <h2 className="text-lg font-bold tracking-tight">Debt free by {goal.targetAge}</h2>
              <p className="text-xs text-muted-foreground">
                By your {goal.targetAge}th birthday · {fmtDate(goal.deadlineISO, "long")} · you are {goal.currentAge} now
              </p>
            </div>
          </div>
          <span className="rounded-full px-3 py-1 text-xs font-semibold text-white" style={{ background: meta.tint }}>
            {meta.label}
          </span>
        </div>

        {done ? (
          <p className="text-sm text-muted-foreground">
            You did it. Your true net worth is at or above $0, so everything you own now covers what you owe home.
          </p>
        ) : (
          <>
            <div>
              <p className="mb-2 text-[0.65rem] font-medium uppercase tracking-wider text-muted-foreground">
                Time to your {goal.targetAge}th birthday
              </p>
              {goal.daysRemaining > 0 ? (
                <Countdown deadlineISO={goal.deadlineISO} fallbackDays={goal.daysRemaining} />
              ) : (
                <p className="text-sm text-negative">The deadline has passed.</p>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-border/60 bg-secondary/30 px-4 py-3">
                <p className="text-[0.65rem] font-medium uppercase tracking-wider text-muted-foreground">Need to save</p>
                <p className="mt-1 text-2xl font-bold tnum text-primary">{fmtMoney(goal.requiredMonthly)}</p>
                <p className="text-xs text-muted-foreground">per month, to reach $0</p>
              </div>
              <div className="rounded-xl border border-border/60 bg-secondary/30 px-4 py-3">
                <p className="text-[0.65rem] font-medium uppercase tracking-wider text-muted-foreground">You&apos;re saving</p>
                <p className={cn("mt-1 text-2xl font-bold tnum", (goal.actualMonthly ?? 0) >= 0 ? "text-positive" : "text-negative")}>
                  {goal.actualMonthly == null ? "n/a" : fmtMoney(goal.actualMonthly, { sign: true })}
                </p>
                <p className="text-xs text-muted-foreground">per month, on average</p>
              </div>
              <div className="rounded-xl border border-border/60 bg-secondary/30 px-4 py-3">
                <p className="text-[0.65rem] font-medium uppercase tracking-wider text-muted-foreground">Still to close</p>
                <p className="mt-1 text-2xl font-bold tnum text-negative">{fmtMoney(goal.gap)}</p>
                <p className="text-xs text-muted-foreground">until debt free</p>
              </div>
            </div>

            <p
              className="rounded-lg border px-4 py-2.5 text-sm text-foreground/90"
              style={{
                borderColor: `color-mix(in oklab, ${meta.tint} 40%, transparent)`,
                background: `color-mix(in oklab, ${meta.tint} 8%, transparent)`,
              }}
            >
              {verdict(goal)}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// --- Year selector ----------------------------------------------------------

function YearSelector({
  years,
  selected,
  onSelect,
  currentYear,
}: {
  years: JourneyYear[];
  selected: number | null;
  onSelect: (y: number | null) => void;
  currentYear: number;
}) {
  const chip = (isActive: boolean) =>
    cn(
      "relative shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition-all duration-200",
      isActive ? "grad-brand text-white shadow-sm shadow-primary/30" : "bg-secondary text-muted-foreground hover:bg-secondary/70 hover:text-foreground",
    );
  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      <button type="button" onClick={() => onSelect(null)} className={chip(selected === null)}>
        Full journey
      </button>
      {[...years]
        .sort((a, b) => a.year - b.year)
        .map((y) => (
          <button key={y.year} type="button" onClick={() => onSelect(y.year)} className={chip(selected === y.year)}>
            {y.label}
            {y.year === currentYear ? (
              <span className="ml-1.5 inline-block size-1.5 rounded-full bg-current align-middle" aria-hidden />
            ) : null}
          </button>
        ))}
    </div>
  );
}

// --- Page -------------------------------------------------------------------

export function JourneyView({ journey }: { journey: Journey }) {
  const [selected, setSelected] = React.useState<number | null>(null);

  const totalEarned = journey.years.reduce((s, y) => s + y.income, 0);
  const totalSaved = journey.years.reduce((s, y) => s + y.saved, 0);

  const monthsInTraj = new Set(journey.trajectory.map((p) => p.month));
  const allBoundaries = journey.years
    .filter((y) => y.year >= 2 && monthsInTraj.has(y.startISO.slice(0, 7)))
    .map((y) => ({ month: y.startISO.slice(0, 7), year: y.year }));

  const freshChapter = journey.dayInCurrentYear <= 2;
  const yearPct = Math.max(2, Math.min(100, Math.round((journey.dayInCurrentYear / 365) * 100)));

  // What the chart / timeline / cards show, driven by the selected year.
  const shownPoints = selected == null ? journey.trajectory : journey.trajectory.filter((p) => p.year === selected);
  const shownBoundaries = selected == null ? allBoundaries : [];
  const shownMilestones = selected == null ? journey.milestones : journey.milestones.filter((m) => m.year === selected);
  const shownYears = selected == null ? journey.years : journey.years.filter((y) => y.year === selected);
  const scope = selected == null ? "The climb" : `Year ${selected} true net worth`;
  const milestoneScope = selected == null ? "Milestones" : `Year ${selected} milestones`;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Yearly Journey"
        description="Your financial story since you landed. Net worth, milestones, and every year in review."
      />

      {/* Celebration hero */}
      <Reveal>
        <Card className="surface sheen relative overflow-hidden py-0">
          <div className="pointer-events-none absolute -right-16 -top-24 size-80 animate-drift rounded-full grad-brand opacity-20 blur-3xl" aria-hidden />
          <div className="pointer-events-none absolute -left-20 bottom-[-6rem] size-72 animate-float rounded-full opacity-15 blur-3xl" style={{ background: "var(--chart-2)" }} aria-hidden />
          {/* Confetti is saved for the real win: the day you become debt free. */}
          {journey.debtFree ? <Confetti /> : null}
          <div className="relative flex flex-col gap-6 p-7 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0">
              <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <span className="flex size-7 items-center justify-center rounded-xl grad-brand text-white shadow-sm shadow-primary/30 [&_svg]:size-4">
                  {freshChapter ? <PartyPopper /> : <Sparkles />}
                </span>
                Year {journey.currentYear} · Day {journey.dayInCurrentYear}
              </span>
              <div className="mt-3 text-4xl font-bold tracking-tight tnum grad-text sm:text-5xl">
                <CountUp value={journey.currentNetWorth} cents />
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                Total net worth, savings and investments included. Built{" "}
                <span className={journey.builtSinceArrival >= 0 ? "font-semibold text-positive" : "font-semibold text-negative"}>
                  {fmtMoney(journey.builtSinceArrival, { sign: true })}
                </span>{" "}
                since you landed on {fmtDate(journey.anchor, "long")}
                {freshChapter ? ". A new chapter starts today." : "."}
              </p>
              {/* Progress through the current year */}
              <div className="mt-4 max-w-sm">
                <div className="mb-1 flex items-center justify-between text-[0.65rem] font-medium uppercase tracking-wider text-muted-foreground">
                  <span>Into Year {journey.currentYear}</span>
                  <span>{journey.dayInCurrentYear} / 365 days</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-secondary">
                  <div className="h-full animate-shine rounded-full" style={{ width: `${yearPct}%`, backgroundImage: "linear-gradient(90deg, var(--brand-1), var(--brand-2), var(--brand-3), var(--brand-1))" }} />
                </div>
              </div>
              {/* True net worth: the honest, all-in number after the debt to home */}
              <div className="mt-4 max-w-md rounded-xl border border-border/70 bg-card/50 px-4 py-3 backdrop-blur-sm">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground">
                      True net worth after family debt
                    </p>
                    <p className={cn("text-2xl font-bold tnum sm:text-3xl", journey.trueNetWorth >= 0 ? "text-positive" : "text-negative")}>
                      {fmtMoney(journey.trueNetWorth, { cents: true })}
                    </p>
                  </div>
                  <span
                    className="flex size-9 shrink-0 items-center justify-center rounded-xl text-white shadow-sm [&_svg]:size-4"
                    style={{ background: journey.debtFree ? "var(--positive)" : "var(--negative)" }}
                  >
                    {journey.debtFree ? <Award /> : <Scale />}
                  </span>
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  {journey.debtFree ? (
                    "What you own now covers everything you owe home. You are debt free."
                  ) : (
                    <>
                      Everything you own minus the{" "}
                      <span className="font-medium text-foreground/80">{fmtMoney(journey.netDebt)}</span> in tuition and
                      support from home.{" "}
                      <span className="font-semibold text-foreground/90">{fmtMoney(journey.gapToDebtFree)}</span> to debt
                      free.
                    </>
                  )}
                </p>
              </div>
            </div>
            <div className="grid shrink-0 grid-cols-3 gap-4 md:border-l md:border-border/60 md:pl-8">
              <div>
                <p className="text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground">Days in US</p>
                <p className="mt-1 text-xl font-semibold tnum sm:text-2xl">{journey.daysInUS.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground">Arrived with</p>
                <p className="mt-1 text-xl font-semibold tnum sm:text-2xl">{fmtMoney(journey.arrivalCapital)}</p>
              </div>
              <div>
                <p className="text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground">Owed to home</p>
                <p className="mt-1 text-xl font-semibold tnum text-negative sm:text-2xl">{fmtMoney(journey.netDebt)}</p>
              </div>
            </div>
          </div>
        </Card>
      </Reveal>

      {/* Journey stat strip */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Reveal delay={60} className="h-full">
          <StatCard label="Days in the US" value={<span className="tnum">{journey.daysInUS.toLocaleString()}</span>} hint={`Since ${fmtDate(journey.anchor, "medium")}`} icon={<CalendarDays />} />
        </Reveal>
        <Reveal delay={120} className="h-full">
          <StatCard label="Net worth built" value={<CountUp value={journey.builtSinceArrival} />} hint="Beyond your arrival funds" accent={journey.builtSinceArrival >= 0 ? "positive" : "negative"} icon={<TrendingUp />} iconClassName="bg-positive" />
        </Reveal>
        <Reveal delay={180} className="h-full">
          <StatCard label="Total earned" value={<CountUp value={totalEarned} />} hint="Across your whole journey" accent="positive" icon={<Coins />} />
        </Reveal>
        <Reveal delay={240} className="h-full">
          <StatCard label="Total saved" value={<CountUp value={totalSaved} />} hint="Investments and vault" accent="positive" icon={<PiggyBank />} iconClassName="bg-positive" />
        </Reveal>
      </div>

      {/* Debt-free goal: countdown, monthly target, and on-track verdict */}
      {journey.goal ? (
        <Reveal delay={270}>
          <DebtFreeGoalCard goal={journey.goal} />
        </Reveal>
      ) : null}

      {/* Year selector: revisit any year */}
      <Reveal delay={280}>
        <YearSelector years={journey.years} selected={selected} onSelect={setSelected} currentYear={journey.currentYear} />
      </Reveal>

      {/* Net worth journey + milestones (respond to the selected year) */}
      <div key={selected ?? "all"} className="space-y-6 animate-in fade-in-0 duration-500">
        <div className="grid gap-4 lg:grid-cols-5">
          <Card className="surface flex flex-col lg:col-span-3">
            <CardHeader>
              <CardTitle>{scope}</CardTitle>
              <p className="text-sm text-muted-foreground">
                What you own (above zero) and what you owe home (below zero), month by month.
              </p>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col">
              <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <span className="h-2.5 w-3 rounded-full" style={{ background: "var(--chart-2)" }} />
                  Net worth (what you own)
                </span>
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <span className="w-4 border-t-2" style={{ borderColor: "var(--negative)" }} />
                  Debt owed home
                </span>
              </div>
              <div className="flex min-h-[340px] flex-1 flex-col justify-center">
                {shownPoints.length ? (
                  <JourneyChart points={shownPoints} boundaries={shownBoundaries} />
                ) : (
                  <p className="py-16 text-center text-sm text-muted-foreground">No net worth movement recorded yet this year.</p>
                )}
              </div>
              <p className="mt-3 border-t border-border/60 pt-3 text-xs text-muted-foreground">
                Net worth sits above the line, debt below it. Your net position is the two combined, and you are debt free
                when it reaches $0. Paying tuition from savings lowers the net worth line, it does not deepen the debt line.
              </p>
            </CardContent>
          </Card>
          <Card className="surface lg:col-span-2">
            <CardHeader>
              <CardTitle>{milestoneScope}</CardTitle>
              <p className="text-sm text-muted-foreground">The moments that mattered.</p>
            </CardHeader>
            <CardContent>
              <Timeline milestones={shownMilestones} />
            </CardContent>
          </Card>
        </div>

        {/* Year by year */}
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <span className="h-6 w-1.5 rounded-full grad-brand" aria-hidden />
            <h2 className="text-xl font-bold tracking-tight">{selected == null ? "Year by year" : `Year ${selected} in review`}</h2>
          </div>
          <div className={cn("grid gap-4", selected == null && "lg:grid-cols-2")}>
            {shownYears.map((y) => (
              <YearCard key={y.year} y={y} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
