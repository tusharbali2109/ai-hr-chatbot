import type { RequirementExtraction, JDGeneration } from "@/lib/ai/schemas";

export const NOT_SPECIFIED = "Not specified";

export interface UnderstandingField {
  label: string;
  value: string;
  clear: boolean;
}

/** Point 16: a UX completeness indicator — not a confidence score. */
export function buildUnderstandingFields(requirement: RequirementExtraction): UnderstandingField[] {
  const experience =
    requirement.experience_min != null || requirement.experience_max != null
      ? `${requirement.experience_min ?? "?"}–${requirement.experience_max ?? "?"} years`
      : NOT_SPECIFIED;

  return [
    { label: "Role", value: requirement.role || NOT_SPECIFIED, clear: Boolean(requirement.role) },
    { label: "Experience", value: experience, clear: requirement.experience_min != null || requirement.experience_max != null },
    {
      label: "Mandatory Skills",
      value: requirement.mandatory_skills.length ? requirement.mandatory_skills.join(", ") : NOT_SPECIFIED,
      clear: requirement.mandatory_skills.length > 0,
    },
    {
      label: "Preferred Skills",
      value: requirement.preferred_skills.length ? requirement.preferred_skills.join(", ") : NOT_SPECIFIED,
      clear: requirement.preferred_skills.length > 0,
    },
    { label: "Location", value: requirement.location, clear: requirement.location !== NOT_SPECIFIED },
    { label: "Work Mode", value: requirement.work_mode, clear: requirement.work_mode !== NOT_SPECIFIED },
    { label: "Employment Type", value: requirement.employment_type, clear: requirement.employment_type !== NOT_SPECIFIED },
    { label: "Education", value: requirement.education, clear: requirement.education !== NOT_SPECIFIED },
  ];
}

export interface JdValidationInput {
  title: string;
  description: string;
  responsibilities: string[];
  required_skills: string[];
  preferred_skills: string[];
  companyId: string | null | undefined;
}

/** Point 14: validation gate before a JD can be approved. */
export function validateJdForApproval(input: JdValidationInput): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!input.title || !input.title.trim()) errors.push("Job title is required.");
  if (!input.description || !input.description.trim()) errors.push("Role description is required.");
  if (!input.responsibilities || input.responsibilities.filter((r) => r.trim()).length === 0) {
    errors.push("At least one responsibility is required.");
  }
  if (!Array.isArray(input.required_skills) || !Array.isArray(input.preferred_skills)) {
    errors.push("Skills must be structured lists.");
  }
  if (!input.companyId) errors.push("This job is not associated with a company.");

  return { valid: errors.length === 0, errors };
}

export interface CriticalFieldDiff {
  experienceChanged: boolean;
  mandatorySkillsAdded: string[];
  mandatorySkillsRemoved: string[];
  hasCriticalChanges: boolean;
}

/** Point 12/13: surface experience/mandatory-skill changes rather than silently applying them. */
export function diffCriticalFields(current: JDGeneration, next: JDGeneration): CriticalFieldDiff {
  const currentMin = current.screening_criteria.experience.min_years;
  const currentMax = current.screening_criteria.experience.max_years;
  const nextMin = next.screening_criteria.experience.min_years;
  const nextMax = next.screening_criteria.experience.max_years;
  const experienceChanged = currentMin !== nextMin || currentMax !== nextMax;

  const currentMandatory = new Set(current.screening_criteria.mandatory.map((s) => s.skill.toLowerCase()));
  const nextMandatory = new Set(next.screening_criteria.mandatory.map((s) => s.skill.toLowerCase()));

  const mandatorySkillsAdded = next.screening_criteria.mandatory
    .filter((s) => !currentMandatory.has(s.skill.toLowerCase()))
    .map((s) => s.skill);
  const mandatorySkillsRemoved = current.screening_criteria.mandatory
    .filter((s) => !nextMandatory.has(s.skill.toLowerCase()))
    .map((s) => s.skill);

  return {
    experienceChanged,
    mandatorySkillsAdded,
    mandatorySkillsRemoved,
    hasCriticalChanges: experienceChanged || mandatorySkillsAdded.length > 0 || mandatorySkillsRemoved.length > 0,
  };
}

/** Guards against submitting an empty/whitespace-only hiring requirement. */
export function isRequirementTextValid(raw: string): boolean {
  return raw.trim().length > 0;
}

/** Authorization: a job may only be read/edited by users in the company that owns it. */
export function isJobOwnedByCompany(jobCompanyId: string | null | undefined, callerCompanyId: string): boolean {
  return Boolean(jobCompanyId) && jobCompanyId === callerCompanyId;
}

/** Versioning: the next version number to write, given the current latest (or none). */
export function computeNextVersionNumber(latestVersionNumber: number | null | undefined): number {
  return (latestVersionNumber ?? 0) + 1;
}

const EMPLOYMENT_TYPES = ["full_time", "part_time", "contract", "internship"] as const;
const WORK_MODES = ["remote", "hybrid", "onsite"] as const;

export function mapEmploymentType(value: string): (typeof EMPLOYMENT_TYPES)[number] {
  const normalized = value.toLowerCase().replace(/[\s-]/g, "_");
  return (EMPLOYMENT_TYPES as readonly string[]).includes(normalized)
    ? (normalized as (typeof EMPLOYMENT_TYPES)[number])
    : "full_time";
}

export function mapWorkMode(value: string): (typeof WORK_MODES)[number] | null {
  const normalized = value.toLowerCase();
  return (WORK_MODES as readonly string[]).includes(normalized) ? (normalized as (typeof WORK_MODES)[number]) : null;
}
