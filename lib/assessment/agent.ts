import { getJob } from "@/lib/services/jobs";
import { getCandidate } from "@/lib/services/candidates";
import { getApplication, updateApplicationStage } from "@/lib/services/applications";
import { getAuthedCompanyId, assertJobOwnership, getApprovedJdVersion } from "@/lib/services/jd";
import {
  hasActiveJobRun,
  createJobAgentRun,
  markAgentRunRunning,
  markAgentRunCompleted,
  markAgentRunFailed,
} from "@/lib/services/agent-runs";
import { logInternalEvent } from "@/lib/services/ingestion";
import {
  createAssessmentVersion,
  getAssessment,
  getLatestAssessmentForJob,
  listAssessmentQuestions,
  updateAssessmentStatus,
  createAssignment as createAssignmentRow,
  getActiveAssignmentForApplication,
} from "@/lib/services/assessments";
import { getCompany } from "@/lib/services/companies";
import { listAutomationRulesForCompany } from "@/lib/services/scheduling";
import { isAutomationEnabled } from "@/lib/communication/logic";
import { sendAssessmentInvitation } from "@/lib/communication/agent";
import { getAIProvider } from "@/lib/ai";
import { computeDeadline, type DeadlineConfig } from "@/lib/assessment/logic";
import type { AssessmentQuestionGeneration } from "@/lib/ai/schemas";
import type { Assessment } from "@/lib/types/database";

export interface GenerateAssessmentResult {
  assessment: Assessment;
}

/**
 * Orchestrates assessment generation for a job (mirrors lib/interview/agent.ts's
 * shape but is job-level, not application-level — an assessment applies to
 * every candidate reaching this job's assessment stage, not one candidate).
 * Always produces a DRAFT — never auto-READY (spec §25: recruiter must
 * review before an assessment can be assigned to anyone).
 */
export async function generateAssessment(jobId: string): Promise<GenerateAssessmentResult> {
  const { userId, companyId } = await getAuthedCompanyId();
  await assertJobOwnership(jobId, companyId);

  const job = await getJob(jobId);
  if (!job) throw new Error("Job not found.");
  if (job.jd_status !== "APPROVED") {
    throw new Error("This job needs an approved JD before an assessment can be generated.");
  }

  if (await hasActiveJobRun("ASSESSMENT_GENERATION", jobId)) {
    throw new Error("An assessment is already being generated for this job.");
  }

  const jdVersion = await getApprovedJdVersion(jobId);
  const agentRun = await createJobAgentRun("ASSESSMENT_GENERATION", jobId);
  await markAgentRunRunning(agentRun.id, "anthropic");

  try {
    const generated = await getAIProvider().generateAssessment({
      jobTitle: job.title,
      jobDescription: job.description,
      requiredSkills: job.required_skills,
      preferredSkills: job.preferred_skills,
      screeningSummary: null,
      interviewSummary: null,
    });

    const assessment = await createAssessmentVersion({
      jobId,
      createdBy: userId,
      title: generated.title,
      description: generated.description,
      instructions: generated.instructions,
      type: generated.type,
      durationMinutes: generated.duration_minutes,
      passingScore: generated.passing_score,
      deadlineConfig: { unit: "DAYS", value: 3 },
      questions: generated.questions,
    });

    await markAgentRunCompleted(agentRun.id, { assessment_id: assessment.id, jd_version_id: jdVersion?.id ?? null });

    return { assessment };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Assessment generation failed for an unknown reason.";
    await markAgentRunFailed(agentRun.id, message);
    throw new Error(message);
  }
}

/**
 * Free-text-instruction-driven variant of generateAssessment (mirrors
 * improveJdAction's shape but for assessments) — instead of generating
 * purely from the job's JD/screening criteria, the recruiter's own
 * description of what the assessment should cover (plus, optionally, text
 * extracted from an uploaded reference document) drives the question set.
 * Job context is still supplied so the AI stays grounded in this job's
 * actual skills. Always produces a new DRAFT, same as generateAssessment.
 */
export async function generateAssessmentFromText(
  jobId: string,
  instruction: string,
  sourceDocumentText: string | null = null
): Promise<GenerateAssessmentResult> {
  if (!instruction.trim() && !sourceDocumentText) {
    throw new Error("Describe what the assessment should cover, or attach a reference file to generate questions from.");
  }

  const { userId, companyId } = await getAuthedCompanyId();
  await assertJobOwnership(jobId, companyId);

  const job = await getJob(jobId);
  if (!job) throw new Error("Job not found.");
  if (job.jd_status !== "APPROVED") {
    throw new Error("This job needs an approved JD before an assessment can be generated.");
  }

  if (await hasActiveJobRun("ASSESSMENT_GENERATION", jobId)) {
    throw new Error("An assessment is already being generated for this job.");
  }

  const jdVersion = await getApprovedJdVersion(jobId);
  const agentRun = await createJobAgentRun("ASSESSMENT_GENERATION", jobId);
  await markAgentRunRunning(agentRun.id, "anthropic");

  try {
    const generated = await getAIProvider().improveAssessment({
      jobContext: {
        jobTitle: job.title,
        jobDescription: job.description,
        requiredSkills: job.required_skills,
        preferredSkills: job.preferred_skills,
        screeningSummary: null,
        interviewSummary: null,
      },
      currentQuestions: null,
      instruction: instruction.trim() || "Generate an assessment from the attached reference material.",
      sourceDocumentText,
    });

    const assessment = await createAssessmentVersion({
      jobId,
      createdBy: userId,
      title: generated.title,
      description: generated.description,
      instructions: generated.instructions,
      type: generated.type,
      durationMinutes: generated.duration_minutes,
      passingScore: generated.passing_score,
      deadlineConfig: { unit: "DAYS", value: 3 },
      questions: generated.questions,
    });

    await markAgentRunCompleted(agentRun.id, { assessment_id: assessment.id, jd_version_id: jdVersion?.id ?? null });

    return { assessment };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Assessment generation failed for an unknown reason.";
    await markAgentRunFailed(agentRun.id, message);
    throw new Error(message);
  }
}

export interface RegenerateAssessmentQuestionsResult {
  assessment: Assessment;
  questions: AssessmentQuestionGeneration[];
}

/**
 * Recruiter-instructed revision of an already-generated DRAFT question set
 * (e.g. "make question 3 harder", "add 2 more questions about React
 * hooks") — the assessment builder's analog of improveJdAction. Returns the
 * full revised question list; it does not persist anything itself — the
 * caller (lib/actions/assessment.ts) enforces the DRAFT-only edit guard and
 * persists the result via replaceAssessmentQuestions.
 */
export async function regenerateAssessmentQuestions(
  assessmentId: string,
  instruction: string
): Promise<RegenerateAssessmentQuestionsResult> {
  if (!instruction.trim()) throw new Error("Describe how the AI should change the questions.");

  const { companyId } = await getAuthedCompanyId();
  const assessment = await getAssessment(assessmentId);
  if (!assessment) throw new Error("Assessment not found.");
  await assertJobOwnership(assessment.job_id, companyId);

  const job = await getJob(assessment.job_id);
  if (!job) throw new Error("Job not found.");

  const currentQuestions = await listAssessmentQuestions(assessmentId);

  const generated = await getAIProvider().improveAssessment({
    jobContext: {
      jobTitle: job.title,
      jobDescription: job.description,
      requiredSkills: job.required_skills,
      preferredSkills: job.preferred_skills,
      screeningSummary: null,
      interviewSummary: null,
    },
    currentQuestions: currentQuestions.map((q) => ({
      sequence: q.sequence,
      type: q.type,
      question: q.question,
      instructions: q.instructions,
      points: q.points,
      difficulty: q.difficulty,
      options: q.options,
      expected_answer: q.expected_answer,
      evaluation_criteria: q.evaluation_criteria ?? "",
    })),
    instruction,
  });

  return { assessment, questions: generated.questions };
}

/** Recruiter approval gate — only a DRAFT/READY assessment with every
 * question fully specified can become READY and assignable. */
export async function approveAssessment(assessmentId: string): Promise<Assessment> {
  const { companyId } = await getAuthedCompanyId();
  const assessment = await getAssessment(assessmentId);
  if (!assessment) throw new Error("Assessment not found.");
  const job = await getJob(assessment.job_id);
  await assertJobOwnership(assessment.job_id, companyId);
  if (!job) throw new Error("Job not found.");

  const questions = await listAssessmentQuestions(assessmentId);
  if (questions.length === 0) throw new Error("An assessment needs at least one question before it can be approved.");
  for (const q of questions) {
    if (!q.points || q.points <= 0) throw new Error(`Question ${q.sequence} needs a point value greater than 0.`);
    if (!q.question.trim()) throw new Error(`Question ${q.sequence} is missing its question text.`);
    if (!q.evaluation_criteria || !q.evaluation_criteria.trim()) {
      throw new Error(`Question ${q.sequence} needs evaluation criteria before it can be approved.`);
    }
    if (q.type === "MCQ" && (!q.options || q.options.length < 2)) {
      throw new Error(`Question ${q.sequence} is MCQ but needs at least 2 options.`);
    }
  }

  await updateAssessmentStatus(assessmentId, "READY");
  const updated = await getAssessment(assessmentId);
  if (!updated) throw new Error("Assessment disappeared after approval.");
  return updated;
}

export interface CreateAssignmentOptions {
  overrideEligibility?: boolean;
}

export interface CreateAssignmentResult {
  assignmentId: string;
  deadline: string;
}

/**
 * Assigns the job's latest READY assessment to one candidate's application
 * (mirrors triggerInterview's shape). Transitions the application into
 * ASSESSMENT_SENT immediately and emits the assessment.assigned event —
 * a log-only forward-compatibility hook for Phase 7's email automation,
 * exactly like screening's candidate.shortlisted_for_ai_interview hook.
 */
export async function createAssignment(
  applicationId: string,
  deadlineConfig: DeadlineConfig,
  options: CreateAssignmentOptions = {}
): Promise<CreateAssignmentResult> {
  const { companyId } = await getAuthedCompanyId();
  const application = await getApplication(applicationId);
  if (!application) throw new Error("Application not found.");
  await assertJobOwnership(application.job_id, companyId);

  if (application.current_stage !== "INTERVIEW_SHORTLISTED" && !options.overrideEligibility) {
    throw new Error("Only candidates who passed the AI interview can be sent an assessment.");
  }

  const assessment = await getLatestAssessmentForJob(application.job_id);
  if (!assessment) throw new Error("This job has no generated assessment yet.");
  if (assessment.status !== "READY") throw new Error("The assessment must be approved (READY) before it can be assigned.");

  if (await getActiveAssignmentForApplication(applicationId)) {
    throw new Error("An assessment is already assigned for this application.");
  }

  const [job, candidate] = await Promise.all([getJob(application.job_id), getCandidate(application.candidate_id)]);
  if (!job) throw new Error("Job not found.");
  if (!candidate) throw new Error("Candidate not found.");

  const assignedAt = new Date().toISOString();
  const deadline = computeDeadline(assignedAt, deadlineConfig);

  const assignment = await createAssignmentRow({
    assessmentId: assessment.id,
    applicationId,
    candidateId: application.candidate_id,
    assignedAt,
    deadline,
  });

  await updateApplicationStage(applicationId, application.current_stage, "ASSESSMENT_SENT", "Assessment assigned", {
    source: "assessment",
    decision_source: "HUMAN",
    assignment_id: assignment.id,
  });

  await logInternalEvent("assessment.assigned", {
    application_id: applicationId,
    candidate_id: application.candidate_id,
    job_id: application.job_id,
    payload: { assignment_id: assignment.id, assessment_id: assessment.id, deadline },
  });

  const rules = await listAutomationRulesForCompany(companyId);
  if (isAutomationEnabled(rules, "auto_send_assessment_email")) {
    const company = await getCompany(companyId);
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const deadlineLabel = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(deadline));

    await sendAssessmentInvitation(
      {
        companyId,
        companyName: company?.name ?? "the company",
        candidateId: application.candidate_id,
        applicationId,
        candidateName: candidate.name,
        candidateEmail: candidate.email,
        jobTitle: job.title,
      },
      { assessmentLink: `${appUrl}/candidate/login`, deadline: deadlineLabel }
    );
  }

  return { assignmentId: assignment.id, deadline };
}
