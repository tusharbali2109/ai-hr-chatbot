"use server";

import { revalidatePath } from "next/cache";
import { updateApplicationStage } from "@/lib/services/applications";
import type { RecruitmentStage } from "@/lib/stages";

export async function updateApplicationStageAction(
  applicationId: string,
  fromStage: RecruitmentStage,
  toStage: RecruitmentStage
) {
  await updateApplicationStage(applicationId, fromStage, toStage);
  revalidatePath("/applications");
  revalidatePath("/dashboard");
}
