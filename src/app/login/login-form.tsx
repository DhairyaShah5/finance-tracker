"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signIn, signUp } from "./actions";

export function LoginForm() {
  const router = useRouter();
  const formRef = React.useRef<HTMLFormElement>(null);
  const [pending, startTransition] = React.useTransition();
  const [confirmSent, setConfirmSent] = React.useState(false);

  function submit(action: "signin" | "signup") {
    const form = formRef.current;
    if (!form) return;
    const formData = new FormData(form);
    startTransition(async () => {
      const res = action === "signin" ? await signIn(formData) : await signUp(formData);
      if (!res.ok) {
        toast.error(res.error ?? "Something went wrong.");
        return;
      }
      if (action === "signup" && res.needsConfirmation) {
        setConfirmSent(true);
        return;
      }
      toast.success(action === "signin" ? "Welcome back." : "Account created.");
      router.push("/");
      router.refresh();
    });
  }

  if (confirmSent) {
    return (
      <div className="space-y-2 text-center">
        <h2 className="text-lg font-medium">Check your email</h2>
        <p className="text-sm text-muted-foreground">
          We sent a confirmation link. Click it to finish setting up your account, then sign in.
        </p>
        <Button variant="outline" className="mt-2" onClick={() => setConfirmSent(false)}>
          Back to sign in
        </Button>
      </div>
    );
  }

  return (
    <form
      ref={formRef}
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit("signin");
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required placeholder="you@example.com" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input id="password" name="password" type="password" autoComplete="current-password" required minLength={6} placeholder="••••••••" />
      </div>
      <div className="flex flex-col gap-2 pt-1">
        <Button type="submit" disabled={pending}>
          {pending ? "Working…" : "Sign in"}
        </Button>
        <Button type="button" variant="outline" disabled={pending} onClick={() => submit("signup")}>
          Create account
        </Button>
      </div>
    </form>
  );
}
