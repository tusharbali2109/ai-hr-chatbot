import Link from "next/link";
import { ClipboardCheck, BriefcaseBusiness, Video } from "lucide-react";

export default function CandidateHome() {
  return (
    <div className="mx-auto max-w-3xl px-5 py-16">
      <h1 className="text-2xl font-semibold text-foreground">Candidate workspace</h1>
      <p className="mt-2 text-muted-foreground">Continue the activity assigned by the hiring team.</p>
      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <Link href="/candidate/video-interview" className="rounded-xl border border-border bg-surface p-6 hover:border-accent">
          <Video className="h-6 w-6 text-accent" />
          <h2 className="mt-3 font-semibold text-foreground">AI Video Interview</h2>
          <p className="mt-1 text-sm text-muted-foreground">A short video interview with our AI interviewer.</p>
        </Link>
        <Link href="/candidate/assessment" className="rounded-xl border border-border bg-surface p-6 hover:border-accent">
          <ClipboardCheck className="h-6 w-6 text-accent" />
          <h2 className="mt-3 font-semibold text-foreground">Assessment</h2>
          <p className="mt-1 text-sm text-muted-foreground">Complete role-specific questions.</p>
        </Link>
        <Link href="/candidate/workday" className="rounded-xl border border-border bg-surface p-6 hover:border-accent">
          <BriefcaseBusiness className="h-6 w-6 text-accent" />
          <h2 className="mt-3 font-semibold text-foreground">Digital Workday</h2>
          <p className="mt-1 text-sm text-muted-foreground">Work through realistic decisions and scenarios.</p>
        </Link>
      </div>
    </div>
  );
}
