"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

export function CandidateLoginForm({ next }: { next: string }) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const redirectTo = `${window.location.origin}/candidate/auth/callback?next=${encodeURIComponent(next)}`;
    const { error: signInError } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo } });

    setLoading(false);
    if (signInError) {
      setError(signInError.message);
      return;
    }
    setSent(true);
  }

  if (sent) {
    return (
      <div className="w-full max-w-sm text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Check your email</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          We sent a sign-in link to <span className="text-foreground">{email}</span>. Open it on this device to access your assessment.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-sm">
      <div className="mb-8 flex items-center gap-2.5">
        <div className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)] bg-accent text-accent-foreground">
          <Sparkles className="h-4.5 w-4.5" />
        </div>
        <span className="text-base font-semibold tracking-tight">Candidate Portal</span>
      </div>

      <h1 className="text-2xl font-semibold tracking-tight text-foreground">Access your assessment</h1>
      <p className="mt-1.5 text-sm text-muted-foreground">Enter the email you applied with — we&apos;ll send you a sign-in link.</p>

      <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="email" className="text-sm font-medium text-foreground">
            Email
          </label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </div>

        {error && (
          <p role="alert" className="rounded-[var(--radius-sm)] bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}

        <Button type="submit" size="lg" disabled={loading} className="mt-2 w-full">
          {loading ? "Sending link…" : "Send sign-in link"}
        </Button>
      </form>
    </div>
  );
}
