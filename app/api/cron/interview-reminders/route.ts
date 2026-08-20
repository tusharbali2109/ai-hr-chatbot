import { NextResponse } from "next/server";
import { createWebhookClient } from "@/lib/supabase/webhook-client";
import { listConfirmedInterviewsNeedingReminder, updateScheduledInterview, getInterviewer, listAutomationRulesForCompany } from "@/lib/services/scheduling";
import { getApplication } from "@/lib/services/applications";
import { getCandidate } from "@/lib/services/candidates";
import { getJob } from "@/lib/services/jobs";
import { getCompany } from "@/lib/services/companies";
import { isAutomationEnabled } from "@/lib/communication/logic";
import { sendInterviewReminder } from "@/lib/communication/agent";

// Vercel Hobby plan only allows once-daily cron schedules (see vercel.json),
// not the every-15-minutes cadence this was tuned for. Widened to a full
// day so the 24h window is still reliably caught by one daily sweep — but
// this means the "2h" window can no longer be a precise 2-hours-before
// alert: with only one run a day, it now just fires whenever that day's
// sweep happens to catch it, anywhere up to ~24h before the interview.
// Genuinely can't do better without a finer-grained cron (Vercel Pro, or a
// separate free cron service hitting this route more often). Idempotency
// (reminder_24h_sent_at/reminder_2h_sent_at + email_messages' key) still
// guarantees each interview only ever gets one reminder per window.
const LOOKAHEAD_MINUTES = 24 * 60;

/**
 * Scheduled sweep sending 24h/2h-before reminders for confirmed
 * interviews to both candidate and interviewer (spec §22). Self-verifies
 * via the same Vercel Cron Authorization: Bearer contract as the other
 * cron routes. Idempotency is belt-and-suspenders: the
 * reminder_24h_sent_at/reminder_2h_sent_at columns are stamped immediately
 * after a successful send (checked by the query itself, so a re-run in the
 * same window is a no-op), on top of email_messages' own idempotency key.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Cron endpoint is not configured (CRON_SECRET unset)." }, { status: 500 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const supabase = createWebhookClient();
  const now = Date.now();

  let sent = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const window of ["24h", "2h"] as const) {
    const hours = window === "24h" ? 24 : 2;
    const from = new Date(now + hours * 60 * 60 * 1000).toISOString();
    const to = new Date(now + (hours * 60 + LOOKAHEAD_MINUTES) * 60 * 1000).toISOString();

    const interviews = await listConfirmedInterviewsNeedingReminder(window, from, to, supabase);

    for (const interview of interviews) {
      try {
        const application = await getApplication(interview.application_id, supabase);
        if (!application) continue;

        const [job, candidate, interviewer] = await Promise.all([
          getJob(application.job_id, supabase),
          getCandidate(interview.candidate_id, supabase),
          getInterviewer(interview.interviewer_id, supabase),
        ]);
        if (!job || !candidate || !interviewer) continue;

        const rules = await listAutomationRulesForCompany(job.company_id, supabase);
        if (!isAutomationEnabled(rules, "auto_send_interview_reminders")) {
          skipped++;
          continue;
        }

        const company = await getCompany(job.company_id, supabase);
        const displayDate = new Intl.DateTimeFormat("en-US", { timeZone: interview.timezone, dateStyle: "long" }).format(new Date(interview.start_time));
        const displayTime = new Intl.DateTimeFormat("en-US", { timeZone: interview.timezone, timeStyle: "short" }).format(new Date(interview.start_time));

        await sendInterviewReminder(
          {
            companyId: job.company_id,
            companyName: company?.name ?? "the company",
            candidateId: interview.candidate_id,
            applicationId: interview.application_id,
            candidateName: candidate.name,
            candidateEmail: candidate.email,
            jobTitle: job.title,
          },
          { interviewDate: displayDate, interviewTime: displayTime, window },
          supabase
        );

        if (isAutomationEnabled(rules, "auto_notify_interviewer")) {
          await sendInterviewReminder(
            {
              companyId: job.company_id,
              companyName: company?.name ?? "the company",
              candidateId: interview.candidate_id,
              applicationId: interview.application_id,
              candidateName: interviewer.name,
              candidateEmail: interviewer.email,
              jobTitle: job.title,
            },
            { interviewDate: displayDate, interviewTime: displayTime, window },
            supabase
          );
        }

        await updateScheduledInterview(
          interview.id,
          window === "24h" ? { reminder_24h_sent_at: new Date().toISOString() } : { reminder_2h_sent_at: new Date().toISOString() },
          supabase
        );

        sent++;
      } catch (err) {
        errors.push(`${interview.id}: ${err instanceof Error ? err.message : "unknown error"}`);
      }
    }
  }

  return NextResponse.json({ sent, skipped, errors });
}
