import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppSidebar } from "@/components/app-sidebar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Note: settings + lookups are provisioned in requireUser() (awaited by each
  // page before it fetches data). The layout renders in parallel with the page,
  // so seeding here would race the page's queries.

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <AppSidebar email={user.email ?? "Signed in"} />
      <main className="flex-1 overflow-x-hidden">
        <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {children}
        </div>
      </main>
    </div>
  );
}
