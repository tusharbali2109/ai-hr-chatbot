import { getJob } from "@/lib/services/jobs";
import { getCandidate } from "@/lib/services/candidates";
import { getCompany } from "@/lib/services/companies";
import { getApplication, updateApplicationStage } from "@/lib/services/applications";
import { getAuthedCompanyId, assertJobOwnership, getApprovedJdVersion } from "@/lib/services/jd";
import { getLatestScreening } from "@/lib/services/screening";
import { hasActiveRun, createAgentRun, markAgentRunRunning, markAgentRunFailed } from "@/lib/services/agent-runs";
import { createInterview, createInterviewQuestion, getLatestInterview } from "@/lib/services/interviews";
import { getAIProvider } from "@/lib/ai";
import { buildInterviewPlanSections, DEFAULT_INTERVIEW_CONFIG } from "@/lib/interview/logic";
import { sendNextStepEmail } from "@/lib/communication/agent";

export interface StartBrowserInterviewResult {
  interviewId: string;
}

/**
 * The candidate-facing counterpart to triggerInterview (lib/interview/agent.ts):
 * same eligibility rules, same plan-building (buildInterviewPlanSections +
 * per-question generateQuestion calls), same interviews/interview_questions
 * rows — the only real difference is no phone number is needed and no call
 * is placed. Instead the candidate gets an email with a link to
 * /candidate/video-interview and drives the same conversation engine
 * (processTurn) themselves, one answer at a time, via
 * lib/actions/candidate-interview.ts.
 */
export async function startBrowserInterview(applicationId: string): Promise<StartBrowserInterviewResult> {
  const { companyId } = await getAuthedCompanyId();
  const application = await getApplication(applicationId);
  if (!application) throw new Error("Application not found.");
  await assertJobOwnership(application.job_id, companyId);

  if (application.current_stage !== "SHORTLISTED") {
    throw new Error("Only shortlisted candidates can be sent an AI video interview.");
  }

  const [job, candidate, company, latestScreening, priorInterview] = await Promise.all([
    getJob(application.job_id),
    getCandidate(application.candidate_id),
    getCompany(companyId),
    getLatestScreening(applicationId),
    getLatestInterview(applicationId),
  ]);
  if (!job) throw new Error("Job not found.");
  if (!candidate) throw new Error("Candidate not found.");
  if (!job.screening_criteria) throw new Error("This job has no screening criteria to build an interview plan from.");

  if (await hasActiveRun("INTERVIEW", applicationId)) {
    throw new Error("An interview is already in progress for this application.");
  }

  const attemptNumber = (priorInterview?.attempt_number ?? 0) + 1;
  const jdVersion = await getApprovedJdVersion(application.job_id);

  const agentRun = await createAgentRun("INTERVIEW", applicationId);
  await markAgentRunRunning(agentRun.id, "browser");

  await updateApplicationStage(applicationId, application.current_stage, "AI_INTERVIEW", "AI video interview sent", {
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

    const interview = await createInterview({
      applicationId,
      agentRunId: agentRun.id,
      jdVersionId: jdVersion?.id ?? null,
      screeningVersionId: latestScreening?.id ?? null,
      provider: "browser",
      recordingEnabled: false,
      attemptNumber,
      maxAttempts: 1,
    });

    let sequence = 1;
    for (const section of sections) {
      for (let i = 0; i < section.targetQuestions; i++) {
        const generated = await getAIProvider().generateQuestion({
          jobTitle: job.title,
          section: section.name,
          category: section.category ?? null,
          priorTurns: [],
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

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    await sendNextStepEmail(
      {
        companyId,
        companyName: company?.name ?? "the company",
        candidateId: application.candidate_id,
        applicationId,
        candidateName: candidate.name,
        candidateEmail: candidate.email,
        jobTitle: job.title,
      },
      {
        nextSteps: `Please complete your AI video interview at your convenience: ${appUrl}/candidate/video-interview — it takes about ${DEFAULT_INTERVIEW_CONFIG.maxDurationMinutes} minutes. You'll need a working camera and microphone.`,
      }
    );

    return { interviewId: interview.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to prepare the video interview.";
    await markAgentRunFailed(agentRun.id, message);
    throw new Error(message);
  }
}
