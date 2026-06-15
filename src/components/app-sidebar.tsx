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
  Wallet,
  Menu,
  LogOut,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";
import * as React from "react";

const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/transactions", label: "Transactions", icon: ReceiptText },
  { href: "/accounts", label: "Accounts", icon: Landmark },
  { href: "/india", label: "India Transfers", icon: Globe },
  { href: "/debtors", label: "Debtors", icon: Users },
  { href: "/settings", label: "Settings", icon: Settings },
];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");
}

function Brand() {
  return (
    <Link href="/" className="flex items-center gap-2.5 px-2">
      <span className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
        <Wallet className="size-4" />
      </span>
      <span className="text-sm font-semibold tracking-tight">Finance Tracker</span>
    </Link>
  );
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-1 flex-col gap-0.5 px-2">
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = isActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-secondary text-foreground"
                : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
            )}
          >
            <Icon className="size-4 shrink-0" />
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

function SidebarFooter({ email }: { email: string }) {
  return (
    <div className="mt-auto flex flex-col gap-1 border-t border-border p-2">
      <div className="flex items-center justify-between px-2 py-1">
        <span className="truncate text-xs text-muted-foreground" title={email}>
          {email}
        </span>
        <ThemeToggle />
      </div>
      <SignOutButton />
    </div>
  );
}

export function AppSidebar({ email }: { email: string }) {
  const [open, setOpen] = React.useState(false);

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden w-60 shrink-0 flex-col gap-4 border-r border-border bg-sidebar py-4 lg:flex">
        <Brand />
        <NavLinks />
        <SidebarFooter email={email} />
      </aside>

      {/* Mobile top bar */}
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-background/80 px-4 py-3 backdrop-blur lg:hidden">
        <Brand />
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="size-8" aria-label="Open menu">
                <Menu className="size-4" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 gap-4 py-4">
              <SheetTitle className="px-4">Menu</SheetTitle>
              <NavLinks onNavigate={() => setOpen(false)} />
              <SidebarFooter email={email} />
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </>
  );
}
