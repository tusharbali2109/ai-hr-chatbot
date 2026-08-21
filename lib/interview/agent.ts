import { getJob } from "@/lib/services/jobs";
import { getCandidate } from "@/lib/services/candidates";
import { getApplication, updateApplicationStage } from "@/lib/services/applications";
import { getAuthedCompanyId, assertJobOwnership, getApprovedJdVersion } from "@/lib/services/jd";
import { getLatestScreening } from "@/lib/services/screening";
import {
  hasActiveRun,
  createAgentRun,
  markAgentRunRunning,
  markAgentRunCompleted,
  markAgentRunFailed,
} from "@/lib/services/agent-runs";
import { createInterview, createInterviewQuestion, getInterview, getLatestInterview } from "@/lib/services/interviews";
import { logInternalEvent } from "@/lib/services/ingestion";
import { getAIProvider } from "@/lib/ai";
import { getVoiceProvider } from "@/lib/interview/registry";
import { formatE164, buildInterviewPlanSections, DEFAULT_INTERVIEW_CONFIG, mapRecommendationToStage } from "@/lib/interview/logic";
import { fetchCandidateResumeText } from "@/lib/files/resume-text";
import type { InterviewProvider } from "@/lib/types/database";

export interface TriggerInterviewOptions {
  overrideEligibility?: boolean;
}

export interface TriggerInterviewResult {
  interviewId: string;
  status: string;
  completedSynchronously: boolean;
  recommendation?: string;
  overallScore?: number;
}

/**
 * Orchestrates the trigger phase of an interview. Mirrors
 * lib/screening/agent.ts's shape: validate -> guard -> create run ->
 * transition stage immediately -> call the pluggable voice provider ->
 * record the outcome, wrapped so failures are recorded, never thrown past
 * the boundary as a silent rejection.
 *
 * For the mock provider, createOutboundCall runs and finalizes the ENTIRE
 * interview synchronously, so this function also completes the
 * agent-level bookkeeping (stage transition, agent run, internal event)
 * before returning. For a real provider (Twilio), createOutboundCall
 * returns almost immediately after the call is placed — everything past
 * that point happens later in the Twilio status webhook, not here.
 */
export async function triggerInterview(applicationId: string, options: TriggerInterviewOptions = {}): Promise<TriggerInterviewResult> {
  const { companyId } = await getAuthedCompanyId();
  const application = await getApplication(applicationId);
  if (!application) throw new Error("Application not found.");
  await assertJobOwnership(application.job_id, companyId);

  if (application.current_stage !== "SHORTLISTED" && !options.overrideEligibility) {
    throw new Error("Only shortlisted candidates can be called for an AI interview.");
  }

  const [job, candidate, latestScreening, priorInterview] = await Promise.all([
    getJob(application.job_id),
    getCandidate(application.candidate_id),
    getLatestScreening(applicationId),
    getLatestInterview(applicationId),
  ]);
  if (!job) throw new Error("Job not found.");
  if (!candidate) throw new Error("Candidate not found.");
  if (!job.screening_criteria) throw new Error("This job has no screening criteria to build an interview plan from.");

  const toPhoneE164 = formatE164(candidate.phone);
  if (!toPhoneE164) {
    throw new Error("Candidate phone number is missing or invalid — cannot place an AI interview call.");
  }

  if (await hasActiveRun("INTERVIEW", applicationId)) {
    throw new Error("An interview is already in progress for this application.");
  }

  const attemptNumber = (priorInterview?.attempt_number ?? 0) + 1;
  if (attemptNumber > DEFAULT_INTERVIEW_CONFIG.maxCallAttempts) {
    throw new Error(`Maximum call attempts (${DEFAULT_INTERVIEW_CONFIG.maxCallAttempts}) reached — this needs manual handling.`);
  }

  const jdVersion = await getApprovedJdVersion(application.job_id);
  const voiceProvider = getVoiceProvider();

  const agentRun = await createAgentRun("INTERVIEW", applicationId);
  await markAgentRunRunning(agentRun.id, voiceProvider.name);

  await updateApplicationStage(applicationId, application.current_stage, "AI_INTERVIEW", "AI interview started", {
    source: "interview",
    decision_source: "AI",
    agent_run_id: agentRun.id,
  });

  try {
    const sections = buildInterviewPlanSections(
      job.screening_criteria.mandatory.map((m) => m.skill),
      job.screening_criteria.preferred.map((p) => p.skill),
      DEFAULT_INTERVIEW_CONFIG.maxDurationMinutes
    );

    await getAIProvider().generateInterviewPlan({
      jobTitle: job.title,
      companyName: "the company",
      candidateName: candidate.name,
      sections: sections.map((s) => ({ name: s.name, targetMinutes: s.targetMinutes, targetQuestions: s.targetQuestions, category: s.category })),
    });

    const interview = await createInterview({
      applicationId,
      agentRunId: agentRun.id,
      jdVersionId: jdVersion?.id ?? null,
      screeningVersionId: latestScreening?.id ?? null,
      provider: voiceProvider.name as InterviewProvider,
      recordingEnabled: DEFAULT_INTERVIEW_CONFIG.recordingEnabled,
      attemptNumber,
      maxAttempts: DEFAULT_INTERVIEW_CONFIG.maxCallAttempts,
    });

    // Extracted once up front (not per question) — grounds every generated
    // question in the candidate's actual resume where relevant.
    const resumeText = await fetchCandidateResumeText(candidate.resume_url);

    // Persist planned PRIMARY questions upfront so both the mock's
    // synchronous loop and the real Twilio webhook pull from the same list
    // rather than improvising from scratch.
    let sequence = 1;
    for (const section of sections) {
      for (let i = 0; i < section.targetQuestions; i++) {
        const generated = await getAIProvider().generateQuestion({
          jobTitle: job.title,
          section: section.name,
          category: section.category ?? null,
          priorTurns: [],
          resumeText,
        });
        await createInterviewQuestion({
          interviewId: interview.id,
          sequence: sequence++,
          section: section.name,
          category: section.category ?? generated.category,
          question: generated.question,
          questionType: "PRIMARY",
          parentQuestionId: null,
        });
      }
    }

    const callResult = await voiceProvider.createOutboundCall({
      interviewId: interview.id,
      toPhoneE164,
      recordingEnabled: DEFAULT_INTERVIEW_CONFIG.recordingEnabled,
    });

    if (!callResult.completedSynchronously) {
      return { interviewId: interview.id, status: callResult.status, completedSynchronously: false };
    }

    const finalized = await getInterview(interview.id);
    if (!finalized) throw new Error("Interview record disappeared after completion.");

    const finalStage = mapRecommendationToStage(finalized.recommendation, finalized.status);
    await updateApplicationStage(applicationId, "AI_INTERVIEW", finalStage, "AI interview completed", {
      source: "interview",
      decision_source: "AI",
      interview_id: interview.id,
    });

    await markAgentRunCompleted(agentRun.id, {
      interview_id: interview.id,
      recommendation: finalized.recommendation,
      overall_score: finalized.overall_score,
    });

    await logInternalEvent("candidate.interview.completed", {
      application_id: applicationId,
      candidate_id: application.candidate_id,
      job_id: application.job_id,
      payload: { recommendation: finalized.recommendation, overall_score: finalized.overall_score },
    });

    return {
      interviewId: interview.id,
      status: finalized.status,
      completedSynchronously: true,
      recommendation: finalized.recommendation ?? undefined,
      overallScore: finalized.overall_score ?? undefined,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Interview trigger failed for an unknown reason.";
    // Stage stays at AI_INTERVIEW (already set above) — a technical/AI
    // failure must never silently become REJECTED.
    await markAgentRunFailed(agentRun.id, message);
    throw new Error(message);
  }
}

/** Retrying reuses the exact same trigger path — eligibility is overridden
 * since the application is already past SHORTLISTED (sitting at
 * AI_INTERVIEW from the failed/no-answer attempt). */
export async function retryInterview(applicationId: string): Promise<TriggerInterviewResult> {
  return triggerInterview(applicationId, { overrideEligibility: true });
}
