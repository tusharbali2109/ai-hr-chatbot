"use server";

import { revalidatePath } from "next/cache";
import { getAuthedCompanyId, assertJobOwnership } from "@/lib/services/jd";
import { getApplication } from "@/lib/services/applications";
import { replaceAvailabilityForApplication, type AvailabilityBlockInput } from "@/lib/services/scheduling";
import {
  selectInterviewer,
  proposeSlots,
  confirmSlot,
  rescheduleInterview,
  cancelInterview,
  markNoShow,
  type ProposeSlotsResult,
  type ConfirmSlotOutcome,
  type RescheduleResult,
} from "@/lib/scheduling/agent";
import type { Interviewer } from "@/lib/types/database";

async function assertApplicationOwnership(applicationId: string): Promise<{ companyId: string; jobId: string }> {
  const { companyId } = await getAuthedCompanyId();
  const application = await getApplication(applicationId);
  if (!application) throw new Error("Application not found.");
  await assertJobOwnership(application.job_id, companyId);
  return { companyId, jobId: application.job_id };
}

export async function saveCandidateAvailabilityAction(applicationId: string, blocks: AvailabilityBlockInput[]): Promise<void> {
  await assertApplicationOwnership(applicationId);
  await replaceAvailabilityForApplication(applicationId, blocks);
  revalidatePath(`/candidates/${applicationId}`);
}

export async function autoSelectInterviewerAction(applicationId: string, interviewType: string): Promise<Interviewer> {
  await assertApplicationOwnership(applicationId);
  return selectInterviewer(interviewType);
}

export async function proposeInterviewSlotsAction(applicationId: string, interviewerId: string, durationMinutes?: number): Promise<ProposeSlotsResult> {
  await assertApplicationOwnership(applicationId);
  return proposeSlots(applicationId, interviewerId, durationMinutes);
}

export async function confirmInterviewSlotAction(
  applicationId: string,
  interviewerId: string,
  startTime: string,
  endTime: string,
  interviewType: string,
  notifyInterviewer: boolean
): Promise<ConfirmSlotOutcome> {
  const { jobId } = await assertApplicationOwnership(applicationId);
  const outcome = await confirmSlot(applicationId, interviewerId, startTime, endTime, interviewType, notifyInterviewer);
  revalidatePath(`/jobs/${jobId}`);
  revalidatePath("/candidates");
  return outcome;
}

export async function rescheduleInterviewAction(applicationId: string, scheduledInterviewId: string, newStart: string, newEnd: string): Promise<RescheduleResult> {
  const { jobId } = await assertApplicationOwnership(applicationId);
  const result = await rescheduleInterview(scheduledInterviewId, newStart, newEnd);
  revalidatePath(`/jobs/${jobId}`);
  revalidatePath("/candidates");
  return result;
}

export async function cancelInterviewAction(
  applicationId: string,
  scheduledInterviewId: string,
  cancelledBy: "CANDIDATE" | "INTERVIEWER" | "RECRUITER" | "SYSTEM",
  reason: string
): Promise<void> {
  const { jobId } = await assertApplicationOwnership(applicationId);
  await cancelInterview(scheduledInterviewId, cancelledBy, reason);
  revalidatePath(`/jobs/${jobId}`);
  revalidatePath("/candidates");
}

export async function markNoShowAction(applicationId: string, scheduledInterviewId: string): Promise<void> {
  await assertApplicationOwnership(applicationId);
  await markNoShow(scheduledInterviewId);
  revalidatePath(`/candidates/${applicationId}`);
}
