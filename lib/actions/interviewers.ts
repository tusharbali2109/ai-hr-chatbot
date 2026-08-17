"use server";

import { revalidatePath } from "next/cache";
import { getAuthedCompanyId } from "@/lib/services/jd";
import { createInterviewer, updateInterviewer, getInterviewer } from "@/lib/services/scheduling";
import { createOAuthState } from "@/lib/services/scheduling";
import { buildAuthUrl } from "@/lib/oauth/google-calendar";
import type { WorkingHoursBlock, Interviewer } from "@/lib/types/database";

async function assertInterviewerOwnership(interviewerId: string, companyId: string): Promise<Interviewer> {
  const interviewer = await getInterviewer(interviewerId);
  if (!interviewer || interviewer.company_id !== companyId) {
    throw new Error("You do not have access to this interviewer.");
  }
  return interviewer;
}

export interface CreateInterviewerActionInput {
  name: string;
  email: string;
  timezone: string;
  interviewTypes: string[];
  workingHours: WorkingHoursBlock[];
}

export async function createInterviewerAction(input: CreateInterviewerActionInput): Promise<Interviewer> {
  const { companyId } = await getAuthedCompanyId();
  const interviewer = await createInterviewer({
    companyId,
    userId: null,
    name: input.name,
    email: input.email,
    timezone: input.timezone,
    interviewTypes: input.interviewTypes,
    workingHours: input.workingHours,
  });
  revalidatePath("/settings");
  return interviewer;
}

export async function updateInterviewerAction(
  interviewerId: string,
  fields: Partial<Pick<Interviewer, "name" | "email" | "timezone" | "interview_types" | "working_hours">>
): Promise<Interviewer> {
  const { companyId } = await getAuthedCompanyId();
  await assertInterviewerOwnership(interviewerId, companyId);
  const updated = await updateInterviewer(interviewerId, fields);
  revalidatePath("/settings");
  return updated;
}

export async function deactivateInterviewerAction(interviewerId: string): Promise<void> {
  const { companyId } = await getAuthedCompanyId();
  await assertInterviewerOwnership(interviewerId, companyId);
  await updateInterviewer(interviewerId, { active: false });
  revalidatePath("/settings");
}

export async function reactivateInterviewerAction(interviewerId: string): Promise<void> {
  const { companyId } = await getAuthedCompanyId();
  await assertInterviewerOwnership(interviewerId, companyId);
  await updateInterviewer(interviewerId, { active: true });
  revalidatePath("/settings");
}

/** Returns the Google OAuth consent URL to navigate the browser to — the
 * interviewer (or whoever is at this browser session) completes consent
 * themselves; the callback route links the resulting tokens back to this
 * interviewer via the signed oauth_states row. */
export async function startCalendarConnectAction(interviewerId: string): Promise<{ url: string }> {
  const { companyId } = await getAuthedCompanyId();
  await assertInterviewerOwnership(interviewerId, companyId);

  const state = crypto.randomUUID();
  await createOAuthState({
    state,
    interviewerId,
    companyId,
    expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
  });

  return { url: buildAuthUrl(state) };
}
