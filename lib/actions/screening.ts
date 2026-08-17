"use server";

import { revalidatePath } from "next/cache";
import { screenApplication, type ScreenResult } from "@/lib/screening/agent";
import { getApplication, updateApplicationStage } from "@/lib/services/applications";
import { getAuthedCompanyId, assertJobOwnership } from "@/lib/services/jd";
import { logInternalEvent } from "@/lib/services/ingestion";
import type { RecruitmentStage } from "@/lib/stages";

/** Screens (or re-screens) a single application. This is also the unit a
 * batch "Run Screening" modal loops over client-side, one call at a time —
 * there is no server-side batch loop (see Phase 4 plan's flagged decision). */
export async function screenApplicationAction(applicationId: string, jobId: string): Promise<ScreenResult> {
  const result = await screenApplication(applicationId);
  revalidatePath(`/jobs/${jobId}`);
  revalidatePath("/candidates");
  return result;
}

const OVERRIDABLE_STAGES: RecruitmentStage[] = ["SHORTLISTED", "REJECTED", "NEEDS_REVIEW"];

/** Recruiter override of an AI screening recommendation. Always recorded in
 * stage_history with decision_source: HUMAN — never hides that a human
 * changed the outcome. */
export async function overrideScreeningDecisionAction(
  applicationId: string,
  jobId: string,
  newStage: RecruitmentStage,
  reason: string
): Promise<void> {
  if (!OVERRIDABLE_STAGES.includes(newStage)) {
    throw new Error("A screening decision can only be overridden to Shortlisted, Rejected, or Needs Review.");
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

  if (newStage === "SHORTLISTED") {
    await logInternalEvent("candidate.shortlisted_for_ai_interview", {
      application_id: applicationId,
      candidate_id: application.candidate_id,
      job_id: jobId,
      payload: { source: "human_override" },
    });
  }

  revalidatePath(`/jobs/${jobId}`);
  revalidatePath("/candidates");
  revalidatePath(`/candidates/${application.candidate_id}`);
}
