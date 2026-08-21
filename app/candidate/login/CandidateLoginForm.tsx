"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";

/**
 * Candidate sign-in — Google OAuth only (replaces the old email-OTP flow).
 * The candidate never types anything here; we match their Google account's
 * email against the `candidates` table in app/candidate/auth/callback/route.ts
 * once they're back with a session.
 *
 * REQUIRES a one-time dashboard step that can't be done from code: enable
 * the Google provider under Supabase Dashboard → Authentication → Providers,
 * and add this app's `/candidate/auth/callback` URL (both local and
 * production origins) to the provider's authorized redirect URLs. Until
 * that's done, signInWithOAuth below will fail with a "provider not
 * enabled" error from Supabase.
 */
export function CandidateLoginForm({ next }: { next: string }) {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSignInWithGoogle() {
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const redirectTo = `${window.location.origin}/candidate/auth/callback?next=${encodeURIComponent(next)}`;
    const { error: signInError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });

    if (signInError) {
      setLoading(false);
      setError(signInError.message);
    }
    // On success the browser is redirected away to Google, so there's
    // nothing else to do here.
  }

  return (
    <div className="w-full max-w-sm">
      <div className="mb-8 flex items-center gap-2.5">
        <div className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)] bg-accent text-accent-foreground">
          <Sparkles className="h-4.5 w-4.5" />
        </div>
        <span className="text-base font-semibold tracking-tight">Candidate Portal</span>
      </div>

      <h1 className="text-2xl font-semibold tracking-tight text-foreground">Sign in to continue</h1>
      <p className="mt-1.5 text-sm text-muted-foreground">
        Sign in with the Google account matching the email you applied with.
      </p>

      {error && (
        <p role="alert" className="mt-6 rounded-[var(--radius-sm)] bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <Button type="button" size="lg" variant="secondary" disabled={loading} onClick={onSignInWithGoogle} className="mt-8 w-full gap-2.5">
        <GoogleIcon className="h-4.5 w-4.5" />
        {loading ? "Redirecting…" : "Continue with Google"}
      </Button>
    </div>
  );
}

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.47c-.28 1.5-1.13 2.77-2.4 3.62v3h3.88c2.27-2.09 3.57-5.17 3.57-8.81z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.07 7.95-2.92l-3.88-3c-1.08.72-2.45 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.27v3.09C3.25 21.3 7.31 24 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.27a7.2 7.2 0 0 1 0-4.54v-3.1H1.27a12 12 0 0 0 0 10.73l4-3.09z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.44-3.44C17.95 1.19 15.24 0 12 0 7.31 0 3.25 2.7 1.27 6.63l4 3.1c.95-2.85 3.6-4.98 6.73-4.98z"
      />
    </svg>
  );
}
