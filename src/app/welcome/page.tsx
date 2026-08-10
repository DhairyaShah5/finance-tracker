import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, PieChart, ShieldCheck, Sparkles, Target, TrendingUp } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { LogoGlyph } from "@/components/logo";

export const dynamic = "force-dynamic";
export const metadata = { title: "Finance Tracker" };

const FEATURES = [
  { icon: TrendingUp, title: "The climb", desc: "Watch your net worth rise, year by year." },
  { icon: Target, title: "Debt-free goal", desc: "A live countdown and the monthly savings to get there." },
  { icon: PieChart, title: "Budgets & insights", desc: "50/30/20 spending, trends, and where your money goes." },
  { icon: Sparkles, title: "All in sync", desc: "Accounts, transactions, and auto-tracked deposits, everywhere." },
];

export default async function WelcomePage() {
  // Public page. Signed-in owner skips straight to the dashboard.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/");

  return (
    <div className="relative flex min-h-dvh flex-col">
      <header className="flex items-center justify-between px-5 py-4 sm:px-8">
        <div className="flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-xl grad-brand text-white shadow-sm shadow-primary/30">
            <LogoGlyph className="size-5" />
          </span>
          <span className="text-base font-bold tracking-tight grad-text">Finance Tracker</span>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/login">Sign in</Link>
        </Button>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-5 py-12 text-center sm:px-8">
        <div className="animate-in fade-in-0 slide-in-from-bottom-3 duration-700">
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-1 text-xs font-medium text-muted-foreground backdrop-blur">
            <Sparkles className="size-3.5 text-primary" /> Your money, one clear story
          </span>
          <h1 className="mx-auto mt-5 max-w-2xl text-4xl font-bold tracking-tight sm:text-5xl">
            <span className="grad-text">From day one</span> to debt-free.
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-base text-muted-foreground sm:text-lg">
            Net worth, budgets, insights, and your journey out of debt, tracked automatically and kept completely
            private.
          </p>
          <div className="mt-7 flex items-center justify-center">
            <Button asChild size="lg" className="gap-1.5">
              <Link href="/login">
                Get started <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>
        </div>

        <div className="mt-14 grid w-full max-w-4xl grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f, i) => {
            const Icon = f.icon;
            return (
              <Card
                key={f.title}
                className="surface hover-lift animate-in fade-in-0 slide-in-from-bottom-3"
                style={{ animationDelay: `${120 + i * 80}ms`, animationFillMode: "both" }}
              >
                <CardContent className="flex flex-col items-start gap-2 p-4 text-left">
                  <span className="flex size-9 items-center justify-center rounded-xl grad-brand text-white [&_svg]:size-4">
                    <Icon />
                  </span>
                  <p className="text-sm font-semibold">{f.title}</p>
                  <p className="text-xs text-muted-foreground">{f.desc}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </main>

      <footer className="flex items-center justify-center gap-1.5 px-5 py-6 text-xs text-muted-foreground">
        <ShieldCheck className="size-3.5" /> Private. Your data stays yours.
      </footer>
    </div>
  );
}
