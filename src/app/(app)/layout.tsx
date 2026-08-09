import { redirect } from "next/navigation";
import { Eye } from "lucide-react";
import Link from "next/link";
import { getContext } from "@/lib/queries";
import { AppSidebar } from "@/components/app-sidebar";
import { ReadOnlyProvider } from "@/components/read-only-context";
import { RefreshOnFocus } from "@/components/refresh-on-focus";
import { IosInstallHint } from "@/components/ios-install-hint";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Owner (signed in) gets full access; everyone else views the live data
  // read-only. Only redirect to /login when the app has no owner yet.
  const ctx = await getContext();
  if (!ctx) redirect("/login");
  const { user, readOnly } = ctx;

  // Note: settings + lookups are provisioned in requireUser() (awaited by each
  // page before it fetches data). The layout renders in parallel with the page,
  // so seeding here would race the page's queries.

  return (
    <ReadOnlyProvider readOnly={readOnly}>
      <RefreshOnFocus />
      <IosInstallHint />
      <div className="flex min-h-dvh flex-col lg:flex-row">
        <AppSidebar email={user.email ?? "Signed in"} readOnly={readOnly} />
        <main className="flex-1 overflow-x-hidden">
          {readOnly ? (
            <div className="sticky top-0 z-20 flex items-center justify-center gap-2 border-b border-border bg-primary/10 px-4 py-2 text-center text-xs font-medium text-foreground backdrop-blur">
              <Eye className="size-3.5 shrink-0 text-primary" />
              <span>
                View only - this is a live, read-only copy.{" "}
                <Link href="/login" className="text-primary underline-offset-2 hover:underline">
                  Sign in
                </Link>{" "}
                to make changes.
              </span>
            </div>
          ) : null}
          <div className="mx-auto w-full max-w-6xl animate-in fade-in-0 duration-500 px-4 pt-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:px-6 lg:px-8 lg:py-8">
            {children}
          </div>
        </main>
      </div>
    </ReadOnlyProvider>
  );
}
