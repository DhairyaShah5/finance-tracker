import { redirect } from "next/navigation";
import { getContext } from "@/lib/queries";
import { AppSidebar } from "@/components/app-sidebar";
import { ReadOnlyProvider } from "@/components/read-only-context";
import { RefreshOnFocus } from "@/components/refresh-on-focus";
import { IosInstallHint } from "@/components/ios-install-hint";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // The app is private: without a session there's no context, so send visitors
  // to the public landing page to sign in.
  const ctx = await getContext();
  if (!ctx) redirect("/welcome");
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
          <div className="mx-auto w-full max-w-6xl animate-in fade-in-0 duration-500 px-4 pt-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:px-6 lg:px-8 lg:py-8">
            {children}
          </div>
        </main>
      </div>
    </ReadOnlyProvider>
  );
}
