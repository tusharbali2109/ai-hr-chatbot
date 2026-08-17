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
 * Orchestrates screening ONE application. Contains no AI-provider-specific
 * or scoring-formula logic itself — those live in lib/ai and
 * lib/screening/logic.ts respectively. Mirrors lib/jobboards/agent.ts's
 * publishJobToPlatform shape: validate -> call the pluggable provider ->
 * score deterministically -> persist -> record outcome, with every failure
 * path recorded rather than thrown past the boundary and NEVER resulting in
 * a silent REJECTED.
 */
export async function screenApplication(applicationId: string): Promise<ScreenResult> {
  const { companyId } = await getAuthedCompanyId();

  const application = await getApplication(applicationId);
  if (!application) throw new Error("Application not found.");
  await assertJobOwnership(application.job_id, companyId);

  const [job, candidate] = await Promise.all([getJob(application.job_id), getCandidate(application.candidate_id)]);
  if (!job) throw new Error("Job not found.");
  if (!candidate) throw new Error("Candidate not found.");

  if (job.jd_status !== "APPROVED" || !job.screening_criteria) {
    throw new Error("This job does not have an approved JD with screening criteria yet.");
  }

  if (await hasActiveRun("SCREENING", applicationId)) {
    throw new Error("A screening is already in progress for this application.");
  }

  const jdVersion = await getApprovedJdVersion(application.job_id);
  const agentRun = await createAgentRun("SCREENING", applicationId);
  await markAgentRunRunning(agentRun.id, MODEL);

  // Transition into AI_SCREENING immediately — this is what makes the
  // pipeline diagram (APPLIED -> AI_SCREENING -> outcome) real, regardless
  // of which stage the application was in before (first screen or re-screen).
  await updateApplicationStage(applicationId, application.current_stage, "AI_SCREENING", "AI screening started", {
    source: "screening",
    decision_source: "AI",
    agent_run_id: agentRun.id,
  });

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

    await updateApplicationStage(applicationId, "AI_SCREENING", recommendation as RecruitmentStage, reason, {
      source: "screening",
      decision_source: "AI",
      screening_id: screening.id,
    });
    await updateApplicationScore(applicationId, overallScore);

    await markAgentRunCompleted(agentRun.id, { screening_id: screening.id, recommendation, overall_score: overallScore });

    await logInternalEvent("candidate.screening.completed", {
      application_id: applicationId,
      candidate_id: application.candidate_id,
      job_id: application.job_id,
      payload: { recommendation, overall_score: overallScore, screening_id: screening.id },
    });

    // Log-only forward-compatibility hook for a future scheduler (Phase 7) —
    // does NOT auto-queue an interview itself (automatic calling defaults
    // off; Phase 5's interview trigger is recruiter-initiated).
    if (recommendation === "SHORTLISTED") {
      await logInternalEvent("candidate.shortlisted_for_ai_interview", {
        application_id: applicationId,
        candidate_id: application.candidate_id,
        job_id: application.job_id,
        payload: { source: "screening" },
      });
    }

    return { status: "COMPLETED", applicationId, recommendation, overallScore };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Screening failed for an unknown reason.";
    // A technical/AI failure must never silently become REJECTED — the
    // application stays at AI_SCREENING (already set above) so a recruiter
    // sees it as "in progress / needs attention", not rejected.
    await markAgentRunFailed(agentRun.id, message);
    return { status: "FAILED", applicationId, error: message };
  }
}
