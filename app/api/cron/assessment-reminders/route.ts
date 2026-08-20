import { NextResponse } from "next/server";
import { createWebhookClient } from "@/lib/supabase/webhook-client";
import { listAssignmentsNeedingReminder, getAssessment } from "@/lib/services/assessments";
import { getApplication } from "@/lib/services/applications";
import { getCandidate } from "@/lib/services/candidates";
import { getJob } from "@/lib/services/jobs";
import { getCompany } from "@/lib/services/companies";
import { listAutomationRulesForCompany } from "@/lib/services/scheduling";
import { isAutomationEnabled } from "@/lib/communication/logic";
import { sendAssessmentReminder } from "@/lib/communication/agent";

const REMINDER_WINDOW_HOURS = 24;
// Vercel Hobby plan only allows once-daily cron schedules (see vercel.json),
// not the every-15-minutes cadence this was originally tuned for — widened
// to a full day so the one daily sweep still catches every deadline that
// falls in the next ~24-48h window, instead of missing almost all of them
// with a 15-minute slice. Reminders land less precisely at "24h before" as
// a result (anywhere in that wider window), but idempotency (see below)
// guarantees each assignment still only ever gets one reminder.
const REMINDER_LOOKAHEAD_MINUTES = 24 * 60;

/**
 * Scheduled sweep sending a 24h-before-deadline reminder for pending
 * assessment assignments (spec §22). Self-verifies via Vercel Cron's
 * standard `Authorization: Bearer $CRON_SECRET` contract, exactly like
 * assessment-expiration. Idempotency comes from email_messages'
 * idempotency_key (application_id + "assessment.reminder_24h" + template
 * version) — running this sweep more often than the reminder window is
 * wide is safe by construction.
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
  const from = new Date(now + REMINDER_WINDOW_HOURS * 60 * 60 * 1000).toISOString();
  const to = new Date(now + (REMINDER_WINDOW_HOURS * 60 + REMINDER_LOOKAHEAD_MINUTES) * 60 * 1000).toISOString();

  const assignments = await listAssignmentsNeedingReminder(from, to, supabase);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  let sent = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const assignment of assignments) {
    try {
      const application = await getApplication(assignment.application_id, supabase);
      if (!application) continue;

      const [job, candidate, assessment] = await Promise.all([
        getJob(application.job_id, supabase),
        getCandidate(application.candidate_id, supabase),
        getAssessment(assignment.assessment_id, supabase),
      ]);
      if (!job || !candidate || !assessment) continue;

      const rules = await listAutomationRulesForCompany(job.company_id, supabase);
      if (!isAutomationEnabled(rules, "auto_send_assessment_reminder")) {
        skipped++;
        continue;
      }

      const company = await getCompany(job.company_id, supabase);
      const deadlineLabel = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(assignment.deadline));

      const result = await sendAssessmentReminder(
        {
          companyId: job.company_id,
          companyName: company?.name ?? "the company",
          candidateId: application.candidate_id,
          applicationId: assignment.application_id,
          candidateName: candidate.name,
          candidateEmail: candidate.email,
          jobTitle: job.title,
        },
        { assessmentLink: `${appUrl}/candidate/login`, deadline: deadlineLabel },
        supabase
      );

      if (result.status === "SENT") sent++;
      else skipped++;
    } catch (err) {
      errors.push(`${assignment.id}: ${err instanceof Error ? err.message : "unknown error"}`);
    }
  }

  return NextResponse.json({ processed: assignments.length, sent, skipped, errors });
}
