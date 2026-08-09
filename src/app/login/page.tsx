import { redirect } from "next/navigation";
import { LogoGlyph } from "@/components/logo";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in · Finance Tracker" };

export default async function LoginPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/");

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="flex size-11 items-center justify-center rounded-xl grad-brand text-white shadow-sm shadow-primary/30">
            <LogoGlyph className="size-6" />
          </span>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Finance Tracker</h1>
            <p className="text-sm text-muted-foreground">Your cash flow, online.</p>
          </div>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Welcome</CardTitle>
            <CardDescription>Sign in or create an account to continue.</CardDescription>
          </CardHeader>
          <CardContent>
            <LoginForm />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
