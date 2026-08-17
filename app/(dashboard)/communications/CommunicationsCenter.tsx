"use client";

import { useState } from "react";
import { Mail, CalendarDays, Users, BellRing, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/lib/utils/cn";

export interface EmailRow {
  id: string;
  template: string;
  recipient: string;
  subject: string;
  status: string;
  provider: string | null;
  error: string | null;
  createdAt: string;
  candidateName: string | null;
  jobTitle: string | null;
}

export interface InterviewRow {
  id: string;
  status: string;
  startTime: string;
  timezone: string;
  interviewType: string;
  reminder24hSentAt: string | null;
  reminder2hSentAt: string | null;
  candidateName: string | null;
  interviewerName: string | null;
  jobTitle: string | null;
}

const EMAIL_STATUS_TONE: Record<string, "neutral" | "info" | "success" | "warning" | "danger"> = {
  QUEUED: "neutral",
  SENDING: "info",
  SENT: "success",
  DELIVERED: "success",
  FAILED: "danger",
  BOUNCED: "danger",
  CANCELLED: "neutral",
};

const INTERVIEW_STATUS_TONE: Record<string, "neutral" | "info" | "success" | "warning" | "danger"> = {
  PROPOSED: "info",
  CONFIRMED: "success",
  CANCELLED: "danger",
  COMPLETED: "neutral",
  NO_SHOW: "warning",
  RESCHEDULED: "neutral",
};

const TABS = ["Emails", "Calendar", "Interviews", "Reminders", "Failures"] as const;
type Tab = (typeof TABS)[number];

export function CommunicationsCenter({ emails, interviews }: { emails: EmailRow[]; interviews: InterviewRow[] }) {
  const [tab, setTab] = useState<Tab>("Emails");

  const [nowMs] = useState(() => Date.now());
  const failures = emails.filter((e) => e.status === "FAILED" || e.status === "BOUNCED");
  const upcoming = interviews.filter((i) => i.status === "CONFIRMED" && new Date(i.startTime).getTime() > nowMs);
  const reminded = interviews.filter((i) => i.reminder24hSentAt || i.reminder2hSentAt);

  const counts: Record<Tab, number> = {
    Emails: emails.length,
    Calendar: upcoming.length,
    Interviews: interviews.length,
    Reminders: reminded.length,
    Failures: failures.length,
  };

  return (
    <div>
      <div className="mb-6 flex gap-1 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "relative flex items-center gap-1.5 px-3.5 py-2.5 text-sm font-medium transition-colors duration-[var(--duration-fast)]",
              tab === t ? "text-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {t}
            <span className="rounded-full bg-surface-elevated px-1.5 py-0.5 text-[10px] text-muted-foreground">{counts[t]}</span>
            {tab === t && <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-accent" />}
          </button>
        ))}
      </div>

      {tab === "Emails" &&
        (emails.length === 0 ? (
          <EmptyState icon={Mail} title="No emails yet" description="Automated emails will appear here as they're sent." />
        ) : (
          <RowList>
            {emails.map((e) => (
              <EmailRowView key={e.id} email={e} />
            ))}
          </RowList>
        ))}

      {tab === "Calendar" &&
        (upcoming.length === 0 ? (
          <EmptyState icon={CalendarDays} title="No upcoming interviews" description="Confirmed interviews will appear here." />
        ) : (
          <RowList>
            {upcoming.map((i) => (
              <InterviewRowView key={i.id} interview={i} />
            ))}
          </RowList>
        ))}

      {tab === "Interviews" &&
        (interviews.length === 0 ? (
          <EmptyState icon={Users} title="No interviews scheduled" description="Interview bookings will appear here." />
        ) : (
          <RowList>
            {interviews.map((i) => (
              <InterviewRowView key={i.id} interview={i} />
            ))}
          </RowList>
        ))}

      {tab === "Reminders" &&
        (reminded.length === 0 ? (
          <EmptyState icon={BellRing} title="No reminders sent yet" description="24h/2h interview reminders will appear here." />
        ) : (
          <RowList>
            {reminded.map((i) => (
              <div key={i.id} className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-md)] px-3 py-2.5 hover:bg-surface-elevated">
                <div>
                  <p className="text-sm text-foreground">
                    {i.candidateName ?? "Candidate"} — {i.jobTitle ?? "Interview"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {i.reminder24hSentAt && `24h reminder sent ${new Date(i.reminder24hSentAt).toLocaleString()}`}
                    {i.reminder24hSentAt && i.reminder2hSentAt && " · "}
                    {i.reminder2hSentAt && `2h reminder sent ${new Date(i.reminder2hSentAt).toLocaleString()}`}
                  </p>
                </div>
              </div>
            ))}
          </RowList>
        ))}

      {tab === "Failures" &&
        (failures.length === 0 ? (
          <EmptyState icon={AlertTriangle} title="No failures" description="Failed or bounced emails will appear here." />
        ) : (
          <RowList>
            {failures.map((e) => (
              <EmailRowView key={e.id} email={e} />
            ))}
          </RowList>
        ))}
    </div>
  );
}

function RowList({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col divide-y divide-border rounded-[var(--radius-lg)] border border-border bg-surface p-2">{children}</div>;
}

function EmailRowView({ email }: { email: EmailRow }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-md)] px-3 py-2.5 hover:bg-surface-elevated">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm text-foreground">{email.subject}</span>
          <Badge tone={EMAIL_STATUS_TONE[email.status] ?? "neutral"}>{email.status}</Badge>
          {email.provider === "dev" && <Badge tone="warning">Dev Mode — not actually delivered</Badge>}
        </div>
        <p className="text-xs text-muted-foreground">
          {email.template} → {email.candidateName ?? email.recipient} {email.jobTitle && `· ${email.jobTitle}`}
          {email.error && <span className="text-danger"> — {email.error}</span>}
        </p>
      </div>
      <span className="shrink-0 text-xs text-muted-foreground">{new Date(email.createdAt).toLocaleString()}</span>
    </div>
  );
}

function InterviewRowView({ interview }: { interview: InterviewRow }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-md)] px-3 py-2.5 hover:bg-surface-elevated">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm text-foreground">
            {interview.candidateName ?? "Candidate"} — {interview.interviewType}
          </span>
          <Badge tone={INTERVIEW_STATUS_TONE[interview.status] ?? "neutral"}>{interview.status.replace(/_/g, " ")}</Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          {interview.jobTitle} · with {interview.interviewerName ?? "an interviewer"}
        </p>
      </div>
      <span className="shrink-0 text-xs text-muted-foreground">
        {new Intl.DateTimeFormat("en-US", { timeZone: interview.timezone, dateStyle: "medium", timeStyle: "short" }).format(new Date(interview.startTime))}
      </span>
    </div>
  );
}
