import type { SupabaseClient } from "@supabase/supabase-js";
import { getJob } from "@/lib/services/jobs";
import { getCandidate } from "@/lib/services/candidates";
import { getApplication, updateApplicationStage, updateApplicationScore } from "@/lib/services/applications";
import { getAuthedCompanyId, assertJobOwnership, getApprovedJdVersion } from "@/lib/services/jd";
import {
  hasActiveRun,
  createAgentRun,
  markAgentRunRunning,
  markAgentRunCompleted,
  markAgentRunFailed,
} from "@/lib/services/agent-runs";
import { createScreening } from "@/lib/services/screening";
import { logInternalEvent } from "@/lib/services/ingestion";
import { getCompany } from "@/lib/services/companies";
import { listAutomationRulesForCompany } from "@/lib/services/scheduling";
import { isAutomationEnabled } from "@/lib/communication/logic";
import { sendNextStepEmail } from "@/lib/communication/agent";
import { getAIProvider } from "@/lib/ai";
import { MODEL } from "@/lib/ai/anthropic-provider";
import { buildCandidateProfile } from "@/lib/screening/candidate-data-provider";
import {
  computeWeightedScore,
  evaluateMandatoryStatus,
  decideRecommendation,
  DEFAULT_SCORING_WEIGHTS,
} from "@/lib/screening/logic";
import type { ScreeningRecommendation } from "@/lib/types/database";
import type { RecruitmentStage } from "@/lib/stages";

export interface ScreenResult {
  status: "COMPLETED" | "FAILED";
  applicationId: string;
  recommendation?: ScreeningRecommendation;
  overallScore?: number;
  error?: string;
}

/**
 * Passed by system/background callers (auto-screening triggered right after
 * resume ingestion, no recruiter session available) — bypasses the
 * getAuthedCompanyId()/assertJobOwnership() auth checks that assume an
 * authenticated recruiter and uses the given service-role client for every
 * read/write instead. The manual "Run Screening" button (screenApplicationAction)
 * omits this and keeps the original authed-user behavior unchanged.
 */
export interface SystemScreeningContext {
  client: SupabaseClient;
}

/** Best-effort "you've been shortlisted" notification, sent immediately when
 * AI screening recommends SHORTLISTED — gated by the same auto_send_status_emails
 * automation rule that governs the other candidate status emails, and never
 * allowed to fail the screening run itself. */
async function sendShortlistNotification(
  companyId: string,
  jobTitle: string,
  candidate: { id: string; name: string; email: string },
  applicationId: string,
  client?: SupabaseClient
): Promise<void> {
  try {
    const rules = await listAutomationRulesForCompany(companyId, client);
    if (!isAutomationEnabled(rules, "auto_send_status_emails")) return;

    const company = await getCompany(companyId, client);
    await sendNextStepEmail(
      {
        companyId,
        companyName: company?.name ?? "the company",
        candidateId: candidate.id,
        applicationId,
        candidateName: candidate.name,
        candidateEmail: candidate.email,
        jobTitle,
      },
      { nextSteps: "Our team will be in touch shortly to schedule your next interview." },
      client
    );
  } catch {
    // Email failure must never mask an otherwise-successful screening result.
  }
}

/**
 * Orchestrates screening ONE application. Contains no AI-provider-specific
 * or scoring-formula logic itself — those live in lib/ai and
 * lib/screening/logic.ts respectively. Mirrors lib/jobboards/agent.ts's
 * publishJobToPlatform shape: validate -> call the pluggable provider ->
 * score deterministically -> persist -> record outcome, with every failure
 * path recorded rather than thrown past the boundary and NEVER resulting in
 * a silent REJECTED.
 */
export async function screenApplication(applicationId: string, system?: SystemScreeningContext): Promise<ScreenResult> {
  const client = system?.client;

  const application = await getApplication(applicationId, client);
  if (!application) throw new Error("Application not found.");

  const [job, candidate] = await Promise.all([getJob(application.job_id, client), getCandidate(application.candidate_id, client)]);
  if (!job) throw new Error("Job not found.");
  if (!candidate) throw new Error("Candidate not found.");

  // Authenticated recruiter path still verifies ownership; a system caller
  // (no session) is already scoped to the job it read to trigger this, so
  // there is no separate company to check against.
  if (!system) {
    const { companyId } = await getAuthedCompanyId();
    await assertJobOwnership(application.job_id, companyId);
  }

  if (job.jd_status !== "APPROVED" || !job.screening_criteria) {
    throw new Error("This job does not have an approved JD with screening criteria yet.");
  }

  if (await hasActiveRun("SCREENING", applicationId, client)) {
    throw new Error("A screening is already in progress for this application.");
  }

  const jdVersion = await getApprovedJdVersion(application.job_id, client);
  const agentRun = await createAgentRun("SCREENING", applicationId, client);
  await markAgentRunRunning(agentRun.id, MODEL, client);

  // Transition into AI_SCREENING immediately — this is what makes the
  // pipeline diagram (APPLIED -> AI_SCREENING -> outcome) real, regardless
  // of which stage the application was in before (first screen or re-screen).
  await updateApplicationStage(
    applicationId,
    application.current_stage,
    "AI_SCREENING",
    "AI screening started",
    { source: "screening", decision_source: "AI", agent_run_id: agentRun.id },
    client
  );

  try {
    const profile = buildCandidateProfile(candidate);

    const evaluation = await getAIProvider().evaluateCandidate({
      candidateName: candidate.name,
      candidateProfileText: profile.text,
      jobTitle: job.title,
      jobDescription: job.description,
      responsibilities: job.responsibilities,
      screeningCriteria: job.screening_criteria,
    });

    const overallScore = computeWeightedScore(evaluation.component_scores, DEFAULT_SCORING_WEIGHTS);
    const mandatoryStatus = evaluateMandatoryStatus(evaluation.mandatory_assessments);
    const { recommendation, reason } = decideRecommendation(overallScore, mandatoryStatus, evaluation.confidence);

    const screening = await createScreening({
      client,
      applicationId,
      agentRunId: agentRun.id,
      jdVersionId: jdVersion?.id ?? null,
      status: "COMPLETED",
      overallScore,
      recommendation,
      confidence: evaluation.confidence,
      summary: evaluation.summary,
      strengths: evaluation.strengths,
      gaps: evaluation.gaps,
      concerns: evaluation.concerns,
      componentScores: evaluation.component_scores,
      scoringWeights: DEFAULT_SCORING_WEIGHTS,
      modelName: "anthropic",
      modelVersion: MODEL,
      requirements: [
        ...evaluation.mandatory_assessments.map((a) => ({
          requirement_type: "MANDATORY" as const,
          requirement: a.requirement,
          status: a.status,
          score: null,
          evidence: a.evidence,
        })),
        ...evaluation.preferred_assessments.map((a) => ({
          requirement_type: "PREFERRED" as const,
          requirement: a.requirement,
          status: a.status,
          score: null,
          evidence: a.evidence,
        })),
      ],
    });

    await updateApplicationStage(
      applicationId,
      "AI_SCREENING",
      recommendation as RecruitmentStage,
      reason,
      { source: "screening", decision_source: "AI", screening_id: screening.id },
      client
    );
    await updateApplicationScore(applicationId, overallScore, client);

    await markAgentRunCompleted(agentRun.id, { screening_id: screening.id, recommendation, overall_score: overallScore }, client);

    await logInternalEvent(
      "candidate.screening.completed",
      {
        application_id: applicationId,
        candidate_id: application.candidate_id,
        job_id: application.job_id,
        payload: { recommendation, overall_score: overallScore, screening_id: screening.id },
      },
      client
    );

    // Log-only forward-compatibility hook for a future scheduler (Phase 7) —
    // does NOT auto-queue an interview itself (automatic calling defaults
    // off; Phase 5's interview trigger is recruiter-initiated).
    if (recommendation === "SHORTLISTED") {
      await logInternalEvent(
        "candidate.shortlisted_for_ai_interview",
        {
          application_id: applicationId,
          candidate_id: application.candidate_id,
          job_id: application.job_id,
          payload: { source: "screening" },
        },
        client
      );

      // Zero-manual-work path: notify the candidate the moment they're
      // shortlisted, not just after a later assessment stage. Gated by the
      // same automation rule as other status emails; never throws.
      await sendShortlistNotification(job.company_id, job.title, candidate, applicationId, client);
    }

    return { status: "COMPLETED", applicationId, recommendation, overallScore };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Screening failed for an unknown reason.";
    // A technical/AI failure must never silently become REJECTED — the
    // application stays at AI_SCREENING (already set above) so a recruiter
    // sees it as "in progress / needs attention", not rejected.
    await markAgentRunFailed(agentRun.id, message, client);
    return { status: "FAILED", applicationId, error: message };
  }
}
