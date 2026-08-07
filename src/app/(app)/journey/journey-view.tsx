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
  CalendarDays,
  Coins,
  Flag,
  PartyPopper,
  PiggyBank,
  Plane,
  Sparkles,
  TrendingUp,
  Trophy,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Money } from "@/components/money";
import { CountUp } from "@/components/count-up";
import { Reveal } from "@/components/reveal";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { fmtDate, fmtMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Journey, JourneyYear, Milestone, NetWorthPoint } from "@/lib/journey";

const AXIS = { stroke: "var(--muted-foreground)", fontSize: 11, tickLine: false, axisLine: false };
const moneyTick = (v: number) => fmtMoney(v, { cents: false });
const YEAR_TINT = ["var(--chart-2)", "var(--chart-1)", "var(--chart-5)", "var(--chart-3)", "var(--chart-4)"];
const tintOf = (year: number) => YEAR_TINT[(year - 1) % YEAR_TINT.length];

// --- Net-worth journey chart ------------------------------------------------

function JourneyTip({ active, payload }: { active?: boolean; payload?: Array<{ payload?: NetWorthPoint }> }) {
  if (!active || !payload?.length) return null;
  const p = payload[0]?.payload;
  if (!p) return null;
  return (
    <div className="min-w-36 rounded-xl border border-border/70 bg-popover/85 px-3 py-2 text-xs shadow-xl backdrop-blur-md">
      <p className="mb-1.5 font-semibold">{p.fullLabel}</p>
      <div className="flex items-center gap-2">
        <span className="size-2.5 rounded-full" style={{ background: "var(--chart-2)" }} />
        <span className="text-muted-foreground">Net worth</span>
        <span className="ml-auto font-semibold tnum">{fmtMoney(p.netWorth, { cents: true })}</span>
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
  return (
    <ResponsiveContainer width="100%" height={300}>
      <AreaChart data={points} margin={{ top: 18, right: 12, left: 4, bottom: 0 }}>
        <defs>
          <linearGradient id="grad-journey" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-2)" stopOpacity={0.45} />
            <stop offset="60%" stopColor="var(--chart-2)" stopOpacity={0.12} />
            <stop offset="100%" stopColor="var(--chart-2)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="4 4" stroke="var(--border)" vertical={false} />
        <XAxis
          dataKey="month"
          tickFormatter={(m: string) => monthToLabel.get(m) ?? m}
          minTickGap={14}
          {...AXIS}
          dy={4}
        />
        <YAxis {...AXIS} width={56} tickFormatter={moneyTick} />
        <Tooltip cursor={{ stroke: "var(--border)", strokeWidth: 1 }} content={<JourneyTip />} />
        {boundaries.map((b) => (
          <ReferenceLine
            key={b.month}
            x={b.month}
            stroke="var(--primary)"
            strokeDasharray="4 4"
            strokeOpacity={0.6}
            label={{ value: `Yr ${b.year}`, position: "insideTop", fill: "var(--primary)", fontSize: 10, fontWeight: 600 }}
          />
        ))}
        <Area
          type="monotone"
          dataKey="netWorth"
          name="Net worth"
          stroke="var(--chart-2)"
          strokeWidth={2.5}
          fill="url(#grad-journey)"
          dot={false}
          activeDot={{ r: 5, strokeWidth: 2, stroke: "var(--background)" }}
          animationDuration={900}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// --- Milestone timeline -----------------------------------------------------

const MILESTONE_META: Record<Milestone["kind"], { icon: typeof Plane; tint: string }> = {
  arrival: { icon: Plane, tint: "var(--chart-2)" },
  networth: { icon: TrendingUp, tint: "var(--chart-1)" },
  anniversary: { icon: Flag, tint: "var(--primary)" },
  peak: { icon: Trophy, tint: "var(--chart-5)" },
};

function Timeline({ milestones }: { milestones: Milestone[] }) {
  return (
    <ol className="relative ml-3 space-y-5 border-l border-border/70 pl-6">
      {milestones.map((m, i) => {
        const meta = MILESTONE_META[m.kind];
        const Icon = meta.icon;
        return (
          <li key={`${m.date}-${i}`} className="relative">
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
    <Card className="surface overflow-hidden py-0">
      <div className="h-1 w-full" style={{ background: tint }} aria-hidden />
      <CardContent className="flex flex-col gap-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-bold tracking-tight">{y.label}</h3>
              {y.isCurrent ? (
                <Badge className="border-0 text-white" style={{ background: tint }}>
                  In progress
                </Badge>
              ) : null}
            </div>
            <p className="text-xs text-muted-foreground">
              {fmtDate(y.startISO, "medium")} – {fmtDate(y.endISO, "medium")} · {y.days} days
            </p>
          </div>
          <div className="text-right">
            <p className="text-[0.65rem] font-medium uppercase tracking-wider text-muted-foreground">Net worth</p>
            <p className="text-sm font-semibold tnum">
              {fmtMoney(y.startNetWorth)} → {fmtMoney(y.endNetWorth)}
            </p>
            <p className={cn("flex items-center justify-end gap-0.5 text-sm font-semibold", up ? "text-positive" : "text-negative")}>
              <Arrow className="size-3.5" />
              {fmtMoney(y.growth, { sign: true })}
              {y.growthPct != null ? <span className="text-xs opacity-80"> ({y.growthPct >= 0 ? "+" : ""}{y.growthPct}%)</span> : null}
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
            <YearStat label="Kept (net)">
              <span className={y.net >= 0 ? "text-positive" : "text-negative"}>{fmtMoney(y.net, { sign: true })}</span>
            </YearStat>
            <YearStat label="Savings rate">{y.savingsRate != null ? `${y.savingsRate}%` : "—"}</YearStat>
            <YearStat label="From India (net)">
              {y.indiaNetUsd !== 0 ? fmtMoney(y.indiaNetUsd, { sign: true }) : "—"}
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

// --- Page -------------------------------------------------------------------

export function JourneyView({ journey }: { journey: Journey }) {
  const totalEarned = journey.years.reduce((s, y) => s + y.income, 0);
  const totalSaved = journey.years.reduce((s, y) => s + y.saved, 0);

  const monthsInTraj = new Set(journey.trajectory.map((p) => p.month));
  const boundaries = journey.years
    .filter((y) => y.year >= 2 && monthsInTraj.has(y.startISO.slice(0, 7)))
    .map((y) => ({ month: y.startISO.slice(0, 7), year: y.year }));

  const freshChapter = journey.dayInCurrentYear <= 2;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Yearly Journey"
        description="Your financial story since you landed — net worth, milestones, and every year in review."
      />

      {/* Celebration hero */}
      <Reveal>
        <Card className="surface sheen relative overflow-hidden py-0">
          <div className="pointer-events-none absolute -right-16 -top-24 size-80 rounded-full grad-brand opacity-20 blur-3xl" aria-hidden />
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
                Built{" "}
                <span className={journey.builtSinceArrival >= 0 ? "font-semibold text-positive" : "font-semibold text-negative"}>
                  {fmtMoney(journey.builtSinceArrival, { sign: true })}
                </span>{" "}
                since you landed on {fmtDate(journey.anchor, "long")}
                {freshChapter ? " — a new chapter starts today. 🎉" : "."}
              </p>
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
                <p className="text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground">Peak</p>
                <p className="mt-1 text-xl font-semibold tnum sm:text-2xl">
                  {journey.peak ? fmtMoney(journey.peak.netWorth) : "—"}
                </p>
              </div>
            </div>
          </div>
        </Card>
      </Reveal>

      {/* Journey stat strip */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Reveal delay={60} className="h-full">
          <StatCard
            label="Days in the US"
            value={<span className="tnum">{journey.daysInUS.toLocaleString()}</span>}
            hint={`Since ${fmtDate(journey.anchor, "medium")}`}
            icon={<CalendarDays />}
          />
        </Reveal>
        <Reveal delay={120} className="h-full">
          <StatCard
            label="Net worth built"
            value={<CountUp value={journey.builtSinceArrival} />}
            hint="Beyond your arrival funds"
            accent={journey.builtSinceArrival >= 0 ? "positive" : "negative"}
            icon={<TrendingUp />}
            iconClassName="bg-positive"
          />
        </Reveal>
        <Reveal delay={180} className="h-full">
          <StatCard
            label="Total earned"
            value={<CountUp value={totalEarned} />}
            hint="Across your whole journey"
            accent="positive"
            icon={<Coins />}
          />
        </Reveal>
        <Reveal delay={240} className="h-full">
          <StatCard
            label="Total saved"
            value={<CountUp value={totalSaved} />}
            hint="Investments + vault"
            accent="positive"
            icon={<PiggyBank />}
            iconClassName="bg-positive"
          />
        </Reveal>
      </div>

      {/* Net worth journey + milestones */}
      <Reveal delay={300}>
        <div className="grid gap-4 lg:grid-cols-5">
          <Card className="surface lg:col-span-3">
            <CardHeader>
              <CardTitle>The climb</CardTitle>
              <p className="text-sm text-muted-foreground">
                Your net worth month by month, with each anniversary marked.
              </p>
            </CardHeader>
            <CardContent>
              <JourneyChart points={journey.trajectory} boundaries={boundaries} />
              <p className="mt-3 border-t border-border/60 pt-3 text-xs text-muted-foreground">
                Net worth = spendable funds across the accounts you count toward net worth — the same figure as your
                dashboard.
              </p>
            </CardContent>
          </Card>
          <Card className="surface lg:col-span-2">
            <CardHeader>
              <CardTitle>Milestones</CardTitle>
              <p className="text-sm text-muted-foreground">The moments that mattered.</p>
            </CardHeader>
            <CardContent>
              <Timeline milestones={journey.milestones} />
            </CardContent>
          </Card>
        </div>
      </Reveal>

      {/* Year by year */}
      <Reveal delay={360}>
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <span className="h-6 w-1.5 rounded-full grad-brand" aria-hidden />
            <h2 className="text-xl font-bold tracking-tight">Year by year</h2>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            {journey.years.map((y) => (
              <YearCard key={y.year} y={y} />
            ))}
          </div>
        </div>
      </Reveal>
    </div>
  );
}
