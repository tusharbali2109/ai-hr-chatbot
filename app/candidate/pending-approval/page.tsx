import { Clock } from "lucide-react";

/** Shown after a candidate signs in with Google but their email doesn't
 * match any candidate record with an active assignment (interview,
 * assessment, or digital workday) — see app/candidate/auth/callback/route.ts.
 * There is no separate "approval" table: once a recruiter/admin moves the
 * candidate into an eligible stage (e.g. shortlists them and sends the AI
 * video interview), the next sign-in with the same Google account will pass
 * the same eligibility check and let them straight through. */
export default function PendingApprovalPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-warning/10">
          <Clock className="h-6 w-6 text-warning" />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Pending recruiter approval</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          We couldn&apos;t find anything assigned to this email yet. Once a recruiter moves your application forward
          and sends you an interview, assessment, or activity, sign in again with the same Google account to continue.
        </p>
      </div>
    </div>
  );
}
