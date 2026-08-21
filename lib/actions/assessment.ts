"use server";

import { revalidatePath } from "next/cache";
import {
  generateAssessment,
  approveAssessment,
  createAssignment,
  generateAssessmentFromText,
  regenerateAssessmentQuestions,
} from "@/lib/assessment/agent";
import { generateOpenEndedReview } from "@/lib/assessment/open-ended-review-agent";
import { getAuthedCompanyId, assertJobOwnership } from "@/lib/services/jd";
import { getApplication, updateApplicationStage } from "@/lib/services/applications";
import { createClient } from "@/lib/supabase/server";
import {
  getAssessment,
  getAssignment,
  upsertAssessmentQuestion,
  deleteAssessmentQuestion,
  reorderAssessmentQuestions,
  replaceAssessmentQuestions,
  updateAssessmentMeta,
  createOpenEndedAssessment,
  saveOpenEndedSubmission,
  type UpsertQuestionInput,
  type UpdateAssessmentMetaInput,
} from "@/lib/services/assessments";
import type { Assessment, AssessmentQuestion } from "@/lib/types/database";
import type { RecruitmentStage } from "@/lib/stages";
import type { DeadlineConfig } from "@/lib/assessment/logic";

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/**
 * Dynamic import, not a static one — lib/files/text-extraction.ts pulls in
 * pdf-parse (which wraps pdfjs-dist), and a static import from a "use
 * server" action file gets pulled into Next's action-browser client
 * reference bundle even though it only ever executes server-side, which
 * broke pdfjs-dist's internals with "Object.defineProperty called on
 * non-object" the moment any client component referenced this file. The
 * dynamic import keeps it out of that bundle entirely.
 */
async function readUploadedFile(file: File): Promise<{ buffer: Buffer; text: string }> {
  if (file.size > MAX_UPLOAD_BYTES) throw new Error("File exceeds the 10MB limit.");
  const { extractTextFromFile } = await import("@/lib/files/text-extraction");
  const buffer = Buffer.from(await file.arrayBuffer());
  const text = await extractTextFromFile(buffer, file.name, file.type);
  if (!text) throw new Error("Couldn't read any text from this file — try a different format (PDF, DOCX, or plain text).");
  return { buffer, text };
}

function safeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

/** Builder edits are only allowed while the assessment is still DRAFT —
 * once READY (and especially once assignments exist), spec §26 requires a
 * new version rather than mutating live content out from under a
 * candidate mid-attempt. */
async function assertEditableDraft(assessmentId: string): Promise<Assessment> {
  const assessment = await getAssessment(assessmentId);
  if (!assessment) throw new Error("Assessment not found.");
  if (assessment.status !== "DRAFT") {
    throw new Error("This assessment is no longer a draft — create a new version to make changes.");
  }
  return assessment;
}

export async function generateAssessmentAction(jobId: string): Promise<{ assessmentId: string }> {
  const { companyId } = await getAuthedCompanyId();
  await assertJobOwnership(jobId, companyId);
  const { assessment } = await generateAssessment(jobId);
  revalidatePath(`/jobs/${jobId}`);
  revalidatePath("/assessments");
  return { assessmentId: assessment.id };
}

/**
 * Generates a structured (non open-ended) draft from a recruiter's free-text
 * description of what the assessment should cover, optionally grounded in a
 * reference file the recruiter uploads (e.g. an existing question bank or
 * assessment doc) — the assessment builder's analog of generateJdAction /
 * improveJdAction's free-text-instruction pattern. Unlike
 * createOpenEndedAssessmentAction, this produces a normal DRAFT with a
 * structured question list that goes through the same builder/approve flow
 * as generateAssessmentAction.
 */
export async function generateAssessmentFromTextAction(
  jobId: string,
  instruction: string,
  formData?: FormData
): Promise<{ assessmentId: string }> {
  const file = formData?.get("file");
  let sourceDocumentText: string | null = null;
  if (file instanceof File && file.size > 0) {
    const { text } = await readUploadedFile(file);
    sourceDocumentText = text;
  }

  const { assessment } = await generateAssessmentFromText(jobId, instruction, sourceDocumentText);
  revalidatePath(`/jobs/${jobId}`);
  revalidatePath("/assessments");
  return { assessmentId: assessment.id };
}

/** Recruiter-instructed revision of a DRAFT assessment's whole question set
 * (e.g. "make question 3 harder", "add 2 more questions about React
 * hooks") — the builder's analog of improveJdAction. Replaces the full
 * question set rather than returning a diff, matching how the AI call
 * itself returns a complete revised list (see regenerateAssessmentQuestions
 * in lib/assessment/agent.ts). */
export async function regenerateAssessmentQuestionsAction(assessmentId: string, instruction: string): Promise<AssessmentQuestion[]> {
  const assessment = await assertEditableDraft(assessmentId);
  const { companyId } = await getAuthedCompanyId();
  await assertJobOwnership(assessment.job_id, companyId);

  const { questions } = await regenerateAssessmentQuestions(assessmentId, instruction);
  const saved = await replaceAssessmentQuestions(assessmentId, questions);

  revalidatePath(`/assessments/${assessmentId}/builder`);
  return saved;
}

export async function saveAssessmentMetaAction(assessmentId: string, input: UpdateAssessmentMetaInput): Promise<void> {
  const assessment = await assertEditableDraft(assessmentId);
  const { companyId } = await getAuthedCompanyId();
  await assertJobOwnership(assessment.job_id, companyId);
  await updateAssessmentMeta(assessmentId, input);
  revalidatePath(`/assessments/${assessmentId}/builder`);
}

export async function saveAssessmentQuestionAction(input: UpsertQuestionInput): Promise<AssessmentQuestion> {
  const assessment = await assertEditableDraft(input.assessmentId);
  const { companyId } = await getAuthedCompanyId();
  await assertJobOwnership(assessment.job_id, companyId);
  const question = await upsertAssessmentQuestion(input);
  revalidatePath(`/assessments/${input.assessmentId}/builder`);
  return question;
}

export async function deleteAssessmentQuestionAction(assessmentId: string, questionId: string): Promise<void> {
  const assessment = await assertEditableDraft(assessmentId);
  const { companyId } = await getAuthedCompanyId();
  await assertJobOwnership(assessment.job_id, companyId);
  await deleteAssessmentQuestion(questionId);
  revalidatePath(`/assessments/${assessmentId}/builder`);
}

export async function reorderQuestionsAction(assessmentId: string, orderedQuestionIds: string[]): Promise<void> {
  const assessment = await assertEditableDraft(assessmentId);
  const { companyId } = await getAuthedCompanyId();
  await assertJobOwnership(assessment.job_id, companyId);
  await reorderAssessmentQuestions(orderedQuestionIds);
  revalidatePath(`/assessments/${assessmentId}/builder`);
}

export async function approveAssessmentAction(assessmentId: string): Promise<void> {
  const assessment = await approveAssessment(assessmentId);
  revalidatePath(`/assessments/${assessmentId}/builder`);
  revalidatePath(`/jobs/${assessment.job_id}`);
  revalidatePath("/assessments");
}

export async function assignAssessmentAction(applicationId: string, deadlineConfig: DeadlineConfig): Promise<{ assignmentId: string }> {
  const result = await createAssignment(applicationId, deadlineConfig);
  const application = await getApplication(applicationId);
  if (application) {
    revalidatePath(`/jobs/${application.job_id}`);
    revalidatePath("/candidates");
    revalidatePath(`/candidates/${application.candidate_id}`);
  }
  return result;
}

const OVERRIDABLE_STAGES: RecruitmentStage[] = ["ASSESSMENT_SHORTLISTED", "REJECTED", "NEEDS_REVIEW"];

/** Recruiter override of an assessment evaluation recommendation. Always
 * recorded in stage_history with decision_source: HUMAN, same pattern as
 * overrideInterviewDecisionAction. */
export async function overrideAssessmentDecisionAction(
  applicationId: string,
  jobId: string,
  newStage: RecruitmentStage,
  reason: string
): Promise<void> {
  if (!OVERRIDABLE_STAGES.includes(newStage)) {
    throw new Error("An assessment decision can only be overridden to Assessment Shortlisted, Rejected, or Needs Review.");
  }
  if (!reason.trim()) {
    throw new Error("Provide a reason for overriding the AI recommendation.");
  }

  const { companyId } = await getAuthedCompanyId();
  await assertJobOwnership(jobId, companyId);

  const application = await getApplication(applicationId);
  if (!application) throw new Error("Application not found.");

  await updateApplicationStage(applicationId, application.current_stage, newStage, reason, {
    source: "human_override",
    decision_source: "HUMAN",
  });

  revalidatePath(`/jobs/${jobId}`);
  revalidatePath("/candidates");
  revalidatePath(`/candidates/${application.candidate_id}`);
}

/** Creates an OPEN_ENDED assessment straight from a recruiter-uploaded
 * brief file (PDF/DOCX/text) — no question builder, no DRAFT review step.
 * Starts at READY immediately so it can be assigned via the existing
 * assignAssessmentAction unchanged. */
export async function createOpenEndedAssessmentAction(jobId: string, title: string, formData: FormData): Promise<{ assessmentId: string }> {
  if (!title.trim()) throw new Error("Give this assessment a title.");

  const { companyId } = await getAuthedCompanyId();
  await assertJobOwnership(jobId, companyId);

  const file = formData.get("file");
  if (!(file instanceof File)) throw new Error("A brief file is required.");
  const { buffer, text } = await readUploadedFile(file);

  const supabase = await createClient();
  const path = `briefs/${jobId}/${Date.now()}_${safeFileName(file.name)}`;
  const { error: uploadError } = await supabase.storage.from("recruiter-uploads").upload(path, buffer, { contentType: file.type, upsert: true });
  if (uploadError) throw uploadError;

  const assessment = await createOpenEndedAssessment({ jobId, createdBy: null, title: title.trim(), briefFilePath: path, briefText: text }, supabase);

  revalidatePath(`/jobs/${jobId}`);
  revalidatePath("/assessments");
  return { assessmentId: assessment.id };
}

/** Recruiter uploads the candidate's completed work (received outside the
 * platform) for an open-ended assignment, then immediately generates the
 * AI review — one action, matching this app's zero-manual-work automation
 * elsewhere. Never touches application stage/score: this is advisory
 * content for the interviewer, not a gating decision. */
export async function uploadOpenEndedSubmissionAction(assignmentId: string, formData: FormData): Promise<{ reviewGenerated: boolean; error?: string }> {
  const assignment = await getAssignment(assignmentId);
  if (!assignment) throw new Error("Assignment not found.");

  const application = await getApplication(assignment.application_id);
  if (!application) throw new Error("Application not found.");

  const { companyId } = await getAuthedCompanyId();
  await assertJobOwnership(application.job_id, companyId);

  const file = formData.get("file");
  if (!(file instanceof File)) throw new Error("A submission file is required.");
  const { buffer, text } = await readUploadedFile(file);

  const supabase = await createClient();
  const path = `submissions/${assignmentId}/${Date.now()}_${safeFileName(file.name)}`;
  const { error: uploadError } = await supabase.storage.from("recruiter-uploads").upload(path, buffer, { contentType: file.type, upsert: true });
  if (uploadError) throw uploadError;

  await saveOpenEndedSubmission(assignmentId, { filePath: path, text }, supabase);

  const result = await generateOpenEndedReview(assignmentId, supabase);

  revalidatePath(`/jobs/${application.job_id}`);
  revalidatePath(`/candidates/${application.candidate_id}`);

  return { reviewGenerated: result.status === "COMPLETED", error: result.error };
}

/** Regenerates the AI review for an already-uploaded submission (e.g. after
 * a bad first pass) without re-uploading the file. */
export async function regenerateOpenEndedReviewAction(assignmentId: string): Promise<{ reviewGenerated: boolean; error?: string }> {
  const assignment = await getAssignment(assignmentId);
  if (!assignment) throw new Error("Assignment not found.");

  const application = await getApplication(assignment.application_id);
  if (!application) throw new Error("Application not found.");

  const { companyId } = await getAuthedCompanyId();
  await assertJobOwnership(application.job_id, companyId);

  const supabase = await createClient();
  const result = await generateOpenEndedReview(assignmentId, supabase);

  revalidatePath(`/jobs/${application.job_id}`);
  revalidatePath(`/candidates/${application.candidate_id}`);

  return { reviewGenerated: result.status === "COMPLETED", error: result.error };
}
