"use server";

import { revalidatePath } from "next/cache";
import { triggerInterview, retryInterview, type TriggerInterviewResult } from "@/lib/interview/agent";
import { getApplication, updateApplicationStage } from "@/lib/services/applications";
import { getAuthedCompanyId, assertJobOwnership } from "@/lib/services/jd";
import type { RecruitmentStage } from "@/lib/stages";

/** Triggers an AI interview call for a single application. This is also
 * the unit a batch "Run Interviews" modal loops over client-side, one call
 * at a time — for the real provider, each call in the loop only enqueues
 * (the UI must say so), unlike the mock provider which completes inline. */
export async function triggerInterviewAction(applicationId: string, jobId: string): Promise<TriggerInterviewResult> {
  const result = await triggerInterview(applicationId);
  revalidatePath(`/jobs/${jobId}`);
  revalidatePath("/candidates");
  revalidatePath(`/candidates/${applicationId}`);
  return result;
}

export async function retryInterviewAction(applicationId: string, jobId: string): Promise<TriggerInterviewResult> {
  const result = await retryInterview(applicationId);
  revalidatePath(`/jobs/${jobId}`);
  revalidatePath("/candidates");
  return result;
}

const OVERRIDABLE_STAGES: RecruitmentStage[] = ["INTERVIEW_SHORTLISTED", "REJECTED", "NEEDS_REVIEW"];

/** Recruiter override of an AI interview recommendation. Always recorded
 * in stage_history with decision_source: HUMAN — never hides that a human
 * changed the outcome. */
export async function overrideInterviewDecisionAction(
  applicationId: string,
  jobId: string,
  newStage: RecruitmentStage,
  reason: string
): Promise<void> {
  if (!OVERRIDABLE_STAGES.includes(newStage)) {
    throw new Error("An interview decision can only be overridden to Interview Shortlisted, Rejected, or Needs Review.");
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
