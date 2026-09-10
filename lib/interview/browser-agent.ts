import { prepareInterviewQuestions } from "./prepare-questions";
import { UserFacingError } from "@/lib/action-result";
import { getJob } from "@/lib/services/jobs";
import { getCandidate } from "@/lib/services/candidates";
import { getCompany } from "@/lib/services/companies";
import { getApplication, updateApplicationStage } from "@/lib/services/applications";
import { getAuthedCompanyId, assertJobOwnership, getApprovedJdVersion } from "@/lib/services/jd";
import { getLatestScreening } from "@/lib/services/screening";
import { hasActiveRun, createAgentRun, markAgentRunRunning, markAgentRunFailed } from "@/lib/services/agent-runs";
import { createInterview, createInterviewQuestion, getLatestInterview } from "@/lib/services/interviews";
import { DEFAULT_INTERVIEW_CONFIG } from "@/lib/interview/logic";
import { sendNextStepEmail } from "@/lib/communication/agent";

export interface StartBrowserInterviewResult {
  interviewId: string;
  emailSent: boolean;
  interviewUrl: string;
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
  if (!application) throw new UserFacingError("Application not found.");
  await assertJobOwnership(application.job_id, companyId);

  if (application.current_stage !== "SHORTLISTED") {
    throw new UserFacingError("Only shortlisted candidates can be sent an AI video interview.");
  }

  const [job, candidate, company, latestScreening, priorInterview] = await Promise.all([
    getJob(application.job_id),
    getCandidate(application.candidate_id),
    getCompany(companyId),
    getLatestScreening(applicationId),
    getLatestInterview(applicationId),
  ]);
  if (!job) throw new UserFacingError("Job not found.");
  if (!candidate) throw new UserFacingError("Candidate not found.");
  if (!job.screening_criteria) throw new UserFacingError("This job has no screening criteria to build an interview plan from.");

  if (await hasActiveRun("INTERVIEW", applicationId)) {
    throw new UserFacingError("An interview is already in progress for this application.");
  }

  const attemptNumber = (priorInterview?.attempt_number ?? 0) + 1;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? (process.env.NODE_ENV === "production" ? "" : "http://localhost:3000");
  if (!appUrl || (process.env.NODE_ENV === "production" && !appUrl.startsWith("https://"))) {
    throw new UserFacingError("Video interview links are not configured. Ask an administrator to set NEXT_PUBLIC_APP_URL to the live HTTPS app URL.");
  }
  const jdVersion = await getApprovedJdVersion(application.job_id);

  const agentRun = await createAgentRun("INTERVIEW", applicationId);
  await markAgentRunRunning(agentRun.id, "browser");

  try {
    const questions = await prepareInterviewQuestions(job.title, job.screening_criteria, candidate.resume_url);

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

    for (const [index, question] of questions.entries()) {
      await createInterviewQuestion({ interviewId: interview.id, sequence: index + 1, ...question, questionType: "PRIMARY", parentQuestionId: null });
    }
    await updateApplicationStage(applicationId, application.current_stage, "AI_INTERVIEW", "AI interview prepared", {
      source: "interview", decision_source: "AI", agent_run_id: agentRun.id,
    });

    const email = await sendNextStepEmail(
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

    return { interviewId: interview.id, emailSent: email.status !== "FAILED" && email.message?.provider !== "dev" && email.message?.status === "SENT", interviewUrl: `${appUrl}/candidate/video-interview` };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to prepare the video interview.";
    await markAgentRunFailed(agentRun.id, message);
    throw err;
  }
}
