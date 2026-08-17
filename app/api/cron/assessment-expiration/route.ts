import { NextResponse } from "next/server";
import { createWebhookClient } from "@/lib/supabase/webhook-client";
import { listExpirableAssignments, updateAssignmentStatus, lockAnswersAsSubmitted, logAssessmentEvent, getAssessment } from "@/lib/services/assessments";
import { updateApplicationStage, getApplication } from "@/lib/services/applications";
import { evaluateAssessmentSubmission } from "@/lib/assessment/evaluation-agent";

/**
 * Scheduled sweep for expired assessment assignments (spec §21). Outside
 * proxy.ts's auth matcher (like the webhook routes) and self-verifies via
 * Vercel Cron's standard contract — a GET request carrying
 * `Authorization: Bearer $CRON_SECRET` (Vercel adds this automatically when
 * CRON_SECRET is set as an env var; see vercel.json's `crons` entry) —
 * mirroring the same self-verification discipline as the webhook routes
 * since there's no Supabase session for a cron trigger. No in-repo
 * scheduler exists yet beyond this wiring, the same gap Phase 5 left for
 * telephony scheduling.
 *
 * If an assessment allows auto_submit_on_expiry, whatever answers exist are
 * submitted and evaluated for scoring; otherwise the assignment is simply
 * marked EXPIRED. Never auto-rejects the application either way — only a
 * completed evaluation (via the auto-submit path) can move the stage.
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
  const nowIso = new Date().toISOString();
  const expirable = await listExpirableAssignments(nowIso, supabase);

  let expired = 0;
  let autoSubmitted = 0;
  const errors: string[] = [];

  for (const assignment of expirable) {
    try {
      const assessment = await getAssessment(assignment.assessment_id, supabase);

      if (assessment?.auto_submit_on_expiry) {
        await updateAssignmentStatus(assignment.id, { status: "SUBMITTED", submitted_at: nowIso }, supabase);
        await lockAnswersAsSubmitted(assignment.id, supabase);
        await logAssessmentEvent(assignment.id, "AUTO_SUBMITTED", {}, supabase);

        const application = await getApplication(assignment.application_id, supabase);
        if (application) {
          await updateApplicationStage(
            assignment.application_id,
            application.current_stage,
            "ASSESSMENT_SUBMITTED",
            "Assessment auto-submitted at deadline",
            { source: "assessment", decision_source: "AI", assignment_id: assignment.id },
            supabase
          );
        }

        await evaluateAssessmentSubmission(assignment.id, supabase);
        autoSubmitted++;
      } else {
        await updateAssignmentStatus(assignment.id, { status: "EXPIRED" }, supabase);
        await logAssessmentEvent(assignment.id, "EXPIRED", {}, supabase);
        expired++;
      }
    } catch (err) {
      errors.push(`${assignment.id}: ${err instanceof Error ? err.message : "unknown error"}`);
    }
  }

  return NextResponse.json({ processed: expirable.length, expired, autoSubmitted, errors });
}
