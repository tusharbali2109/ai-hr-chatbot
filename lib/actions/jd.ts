"use server";

import { revalidatePath } from "next/cache";
import { getAIProvider } from "@/lib/ai";
import type { RequirementExtraction, JDGeneration } from "@/lib/ai/schemas";
import type { StructuredInputOverrides } from "@/lib/ai/provider";
import {
  createJobDraft,
  saveJdVersion,
  approveJdVersion,
  getAuthedCompanyId,
  assertJobOwnership,
  type JobFactsInput,
} from "@/lib/services/jd";
import { validateJdForApproval, mapEmploymentType, mapWorkMode, isRequirementTextValid } from "@/lib/jd/logic";

export async function extractRequirementAction(
  rawRequirement: string,
  overrides: StructuredInputOverrides
): Promise<RequirementExtraction> {
  if (!isRequirementTextValid(rawRequirement)) {
    throw new Error("Describe the role you're hiring for before continuing.");
  }
  return getAIProvider().generateStructuredRequirement(rawRequirement, overrides);
}

export interface GenerateJdResult {
  jobId: string;
  jd: JDGeneration;
}

/** Creates the job row and its first JD version from a confirmed requirement. */
export async function generateJdAction(
  requirement: RequirementExtraction,
  overrides: StructuredInputOverrides
): Promise<GenerateJdResult> {
  const jd = await getAIProvider().generateJD(requirement);

  const jobId = await createJobDraft({
    title: jd.title,
    location: requirement.location,
    employment_type: mapEmploymentType(requirement.employment_type),
    experience_min: requirement.experience_min,
    experience_max: requirement.experience_max,
    work_mode: mapWorkMode(requirement.work_mode),
    salary_range: overrides.salary_range ?? null,
    number_of_openings: overrides.number_of_openings ?? 1,
  });

  await saveJdVersion(jobId, jd, "READY_FOR_REVIEW");

  revalidatePath("/jobs");
  return { jobId, jd };
}

/** Regenerates a fresh draft from the same requirement — caller decides whether to apply it. */
export async function regenerateJdAction(requirement: RequirementExtraction): Promise<JDGeneration> {
  return getAIProvider().generateJD(requirement);
}

/** Produces a revised draft per a free-text instruction — caller decides whether to apply it. */
export async function improveJdAction(currentJD: JDGeneration, instruction: string): Promise<JDGeneration> {
  if (!instruction.trim()) throw new Error("Describe how the AI should improve the JD.");
  return getAIProvider().improveJD(currentJD, instruction);
}

/** Persists an edited/applied JD draft as a new version without approving it. */
export async function saveJdEditsAction(jobId: string, jd: JDGeneration, facts: JobFactsInput = {}): Promise<void> {
  await saveJdVersion(jobId, jd, "READY_FOR_REVIEW", facts);
  revalidatePath(`/jobs/${jobId}`);
}

export async function approveJdAction(jobId: string, jd: JDGeneration, facts: JobFactsInput = {}): Promise<void> {
  const { companyId } = await getAuthedCompanyId();
  await assertJobOwnership(jobId, companyId);

  const { valid, errors } = validateJdForApproval({
    title: jd.title,
    description: jd.description,
    responsibilities: jd.responsibilities,
    required_skills: jd.required_skills,
    preferred_skills: jd.preferred_skills,
    companyId,
  });
  if (!valid) {
    throw new Error(`Cannot approve this JD: ${errors.join(" ")}`);
  }

  await saveJdVersion(jobId, jd, "APPROVED", facts);
  await approveJdVersion(jobId);

  revalidatePath("/jobs");
  revalidatePath(`/jobs/${jobId}`);
}
