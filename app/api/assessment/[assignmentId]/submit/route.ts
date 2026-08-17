import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createWebhookClient } from "@/lib/supabase/webhook-client";
import { getAssignment, updateAssignmentStatus, lockAnswersAsSubmitted, logAssessmentEvent } from "@/lib/services/assessments";
import { evaluateAssessmentSubmission } from "@/lib/assessment/evaluation-agent";
import { updateApplicationStage, getApplication } from "@/lib/services/applications";
import { getCandidate } from "@/lib/services/candidates";
import { getJob } from "@/lib/services/jobs";
import { getCompany } from "@/lib/services/companies";
import { listAutomationRulesForCompany } from "@/lib/services/scheduling";
import { isAutomationEnabled } from "@/lib/communication/logic";
import {
  sendAssessmentSubmittedConfirmation,
  sendNextStepEmail,
  sendRejectionEmail,
  sendNeedsReviewEmail,
  type CandidateEmailContext,
} from "@/lib/communication/agent";
import { isExpired } from "@/lib/assessment/logic";

/**
 * Submission flow (spec §11): validate assignment + deadline, save final
 * answers (already autosaved), lock further writes, set SUBMITTED, then
 * run AI evaluation. There's no job queue in this repo (see AGENTS.md
 * exploration notes) — evaluation runs inline/awaited here, the same
 * synchronous-completion precedent the mock voice provider already
 * established for Phase 5.
 *
 * The ownership check and the lock itself run under the candidate's own
 * session (RLS is the real boundary there); evaluation needs recruiter-only
 * tables with no candidate RLS policy by design, so it runs under the
 * service-role client, exactly like the Twilio webhook's finalization step.
 *
 * Phase 7: after evaluation, the CommunicationAgent sends the submission
 * confirmation always, then a NEXT_STEP/REJECTION/NEEDS_REVIEW email based
 * on the recommendation — gated by the auto_send_status_emails automation
 * rule. Auto-scheduling is intentionally NOT triggered here; per spec §21
 * it only runs when explicitly enabled AND a qualified interviewer's
 * calendar is connected, which the recruiter still has to set up.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ assignmentId: string }> }) {
  const { assignmentId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const assignment = await getAssignment(assignmentId, supabase);
  if (!assignment) return NextResponse.json({ error: "Assignment not found." }, { status: 404 });

  if (["SUBMITTED", "EVALUATING", "COMPLETED", "EXPIRED", "CANCELLED"].includes(assignment.status)) {
    return NextResponse.json({ error: "This assessment has already been submitted." }, { status: 409 });
  }
  if (isExpired(assignment.deadline)) {
    await updateAssignmentStatus(assignmentId, { status: "EXPIRED" }, supabase);
    await logAssessmentEvent(assignmentId, "EXPIRED", {}, supabase);
    return NextResponse.json({ error: "The deadline for this assessment has passed." }, { status: 409 });
  }

  const submittedAt = new Date().toISOString();
  await updateAssignmentStatus(assignmentId, { status: "SUBMITTED", submitted_at: submittedAt }, supabase);
  await lockAnswersAsSubmitted(assignmentId, supabase);
  await logAssessmentEvent(assignmentId, "SUBMITTED", {}, supabase);

  // applications has no candidate RLS policy by design (recruiter-only
  // table) — the stage transition and the evaluation that follows both
  // need the service-role client, same as the Twilio webhook's finalization.
  const serviceClient = createWebhookClient();

  const application = await getApplication(assignment.application_id, serviceClient);
  if (application) {
    await updateApplicationStage(
      assignment.application_id,
      application.current_stage,
      "ASSESSMENT_SUBMITTED",
      "Candidate submitted assessment",
      { source: "assessment", decision_source: "AI", assignment_id: assignmentId },
      serviceClient
    );
  }

  const result = await evaluateAssessmentSubmission(assignmentId, serviceClient);

  if (application) {
    const [job, candidate] = await Promise.all([getJob(application.job_id, serviceClient), getCandidate(application.candidate_id, serviceClient)]);
    if (job && candidate) {
      const company = await getCompany(job.company_id, serviceClient);
      const rules = await listAutomationRulesForCompany(job.company_id, serviceClient);
      const ctx: CandidateEmailContext = {
        companyId: job.company_id,
        companyName: company?.name ?? "the company",
        candidateId: application.candidate_id,
        applicationId: assignment.application_id,
        candidateName: candidate.name,
        candidateEmail: candidate.email,
        jobTitle: job.title,
      };

      if (isAutomationEnabled(rules, "auto_send_status_emails")) {
        await sendAssessmentSubmittedConfirmation(ctx, serviceClient);

        if (result.status === "COMPLETED") {
          if (result.recommendation === "SHORTLIST") {
            await sendNextStepEmail(ctx, { nextSteps: "Our team will reach out shortly to schedule your next interview." }, serviceClient);
          } else if (result.recommendation === "REJECT") {
            await sendRejectionEmail(ctx, serviceClient);
          } else if (result.recommendation === "NEEDS_REVIEW") {
            await sendNeedsReviewEmail(ctx, serviceClient);
          }
        }
      }
    }
  }

  return NextResponse.json({ status: result.status, score: result.score, recommendation: result.recommendation });
}
