"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ReceiptText,
  Landmark,
  Globe,
  Users,
  Settings,
  PieChart,
  Target,
  Sparkles,
  Menu,
  LogOut,
  LogIn,
} from "lucide-react";
import { LogoGlyph } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { ThemeToggle } from "@/components/theme-toggle";
import { ExportButton } from "@/components/export-button";
import { cn } from "@/lib/utils";
import * as React from "react";

const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/transactions", label: "Transactions", icon: ReceiptText },
  { href: "/insights", label: "Insights", icon: PieChart },
  { href: "/budget", label: "Budget", icon: Target },
  { href: "/accounts", label: "Accounts", icon: Landmark },
  { href: "/journey", label: "Yearly Journey", icon: Sparkles },
  { href: "/debtors", label: "Debtors", icon: Users },
  { href: "/india", label: "India Transfers", icon: Globe },
  { href: "/settings", label: "Settings", icon: Settings },
];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");
}

function Brand() {
  return (
    <Link href="/" className="group flex items-center gap-2.5 px-3">
      <span className="flex size-9 items-center justify-center rounded-xl grad-brand text-white shadow-md shadow-primary/30 transition-transform duration-300 group-hover:scale-105 group-hover:rotate-3">
        <LogoGlyph className="size-5" />
      </span>
      <span className="text-base font-bold tracking-tight grad-text">Finance Tracker</span>
    </Link>
  );
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-1 flex-col gap-1 px-3">
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = isActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            className={cn(
              "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200",
              active
                ? "bg-accent text-foreground shadow-sm"
                : "text-muted-foreground hover:bg-secondary/70 hover:text-foreground",
            )}
          >
            {active ? (
              <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full grad-brand" aria-hidden />
            ) : null}
            <Icon
              className={cn(
                "size-4 shrink-0 transition-transform duration-200 group-hover:scale-110",
                active ? "text-primary" : "",
              )}
            />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

function SignOutButton() {
  return (
    <form action="/auth/signout" method="post" className="w-full">
      <Button
        type="submit"
        variant="ghost"
        className="w-full justify-start gap-3 px-3 text-muted-foreground hover:text-foreground"
      >
        <LogOut className="size-4" />
        Sign out
      </Button>
    </form>
  );
}

function SidebarFooter({ email, readOnly }: { email: string; readOnly?: boolean }) {
  return (
    <div className="mt-auto flex flex-col gap-1 border-t border-border p-2">
      <div className="flex items-center justify-between px-2 py-1">
        <span className="truncate text-xs text-muted-foreground" title={readOnly ? "View only" : email}>
          {readOnly ? "View only" : email}
        </span>
        <ThemeToggle />
      </div>
      {readOnly ? (
        <Button
          asChild
          variant="ghost"
          className="w-full justify-start gap-3 px-3 text-muted-foreground hover:text-foreground"
        >
          <Link href="/login">
            <LogIn className="size-4" />
            Sign in to edit
          </Link>
        </Button>
      ) : (
        <>
          <ExportButton />
          <SignOutButton />
        </>
      )}
    </div>
  );
}

export function AppSidebar({ email, readOnly }: { email: string; readOnly?: boolean }) {
  const [open, setOpen] = React.useState(false);

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col gap-5 border-r border-border bg-sidebar/70 py-5 backdrop-blur-xl lg:flex">
        <Brand />
        <NavLinks />
        <SidebarFooter email={email} readOnly={readOnly} />
      </aside>

      {/* Mobile top bar */}
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-background/80 px-4 py-3 pt-[calc(0.75rem+env(safe-area-inset-top))] pl-[calc(1rem+env(safe-area-inset-left))] pr-[calc(1rem+env(safe-area-inset-right))] backdrop-blur lg:hidden">
        <Brand />
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="size-8" aria-label="Open menu">
                <Menu className="size-4" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 gap-4 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
              <SheetTitle className="px-4">Menu</SheetTitle>
              <NavLinks onNavigate={() => setOpen(false)} />
              <SidebarFooter email={email} readOnly={readOnly} />
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </>
  );
}
