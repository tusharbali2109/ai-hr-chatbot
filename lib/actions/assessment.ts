"use server";

import { revalidatePath } from "next/cache";
import { generateAssessment, approveAssessment, createAssignment } from "@/lib/assessment/agent";
import { getAuthedCompanyId, assertJobOwnership } from "@/lib/services/jd";
import { getApplication, updateApplicationStage } from "@/lib/services/applications";
import {
  getAssessment,
  upsertAssessmentQuestion,
  deleteAssessmentQuestion,
  reorderAssessmentQuestions,
  updateAssessmentMeta,
  type UpsertQuestionInput,
  type UpdateAssessmentMetaInput,
} from "@/lib/services/assessments";
import type { Assessment, AssessmentQuestion } from "@/lib/types/database";
import type { RecruitmentStage } from "@/lib/stages";
import type { DeadlineConfig } from "@/lib/assessment/logic";

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
