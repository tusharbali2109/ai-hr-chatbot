import type { RecruitmentStage } from "@/lib/stages";

export class InvalidStageTransitionError extends Error {
  constructor(from: RecruitmentStage, to: RecruitmentStage) {
    super(`Invalid stage transition: ${from} → ${to} is not allowed without an explicit authorized override.`);
    this.name = "InvalidStageTransitionError";
  }
}

/**
 * The recruitment pipeline's transition graph — every edge already used by
 * production code today (verified against lib/*\/agent.ts, lib/actions/*.ts)
 * plus the new Phase 8 links (ASSESSMENT_SHORTLISTED, FINAL_REVIEW).
 *
 * NEEDS_REVIEW is a deliberate exception: it's the recruiter-recovery
 * state, so any forward transition out of it is allowed (handled specially
 * in isValidTransition rather than listed here).
 *
 * The three existing human-override Server Actions (lib/actions/screening.ts,
 * interview.ts, assessment.ts) are the pre-existing "authorized override"
 * pathway the spec itself calls for — they intentionally sit outside this
 * validated graph (same as before Phase 8) rather than being retrofitted to
 * call assertValidTransition, per the plan's "don't rewrite Phase 1-7
 * call sites" decision. New Phase 8 surfaces (StageTransitionService) are
 * validated by default and only skip validation when `override: true` is
 * passed explicitly.
 */
export const VALID_TRANSITIONS: Partial<Record<RecruitmentStage, RecruitmentStage[]>> = {
  APPLIED: ["AI_SCREENING"],
  AI_SCREENING: ["AI_SCREENING", "SHORTLISTED", "REJECTED", "NEEDS_REVIEW"],
  SHORTLISTED: ["AI_INTERVIEW"],
  SKILL_VERIFICATION: ["AI_INTERVIEW"],
  AI_INTERVIEW: ["AI_INTERVIEW", "INTERVIEW_SHORTLISTED", "REJECTED", "NEEDS_REVIEW"],
  INTERVIEW_SHORTLISTED: ["ASSESSMENT_SENT", "INTERVIEW_SCHEDULED"],
  ASSESSMENT_SENT: ["ASSESSMENT_SUBMITTED", "ASSESSMENT_EVALUATED"],
  ASSESSMENT_SUBMITTED: ["ASSESSMENT_EVALUATED", "ASSESSMENT_SHORTLISTED", "REJECTED", "NEEDS_REVIEW"],
  ASSESSMENT_EVALUATED: ["ASSESSMENT_SHORTLISTED", "REJECTED", "NEEDS_REVIEW"],
  ASSESSMENT_SHORTLISTED: ["FINAL_REVIEW", "INTERVIEW_SCHEDULED"],
  FINAL_SHORTLISTED: ["FINAL_REVIEW", "INTERVIEW_SCHEDULED"],
  INTERVIEW_SCHEDULED: ["FINAL_INTERVIEW", "ASSESSMENT_SHORTLISTED"],
  FINAL_INTERVIEW: ["FINAL_REVIEW"],
  FINAL_REVIEW: ["SELECTED", "REJECTED", "NEEDS_REVIEW"],
  SELECTED: [],
  REJECTED: [],
};

export function isValidTransition(from: RecruitmentStage, to: RecruitmentStage): boolean {
  if (from === to) return true;
  if (from === "NEEDS_REVIEW") return true;
  return (VALID_TRANSITIONS[from] ?? []).includes(to);
}

export interface AssertTransitionOptions {
  override?: boolean;
}

/** Throws InvalidStageTransitionError unless the transition is in the
 * graph OR `override: true` is explicitly passed (spec §5's literal
 * example: REJECTED→AI_INTERVIEW is blocked without an authorized override). */
export function assertValidTransition(from: RecruitmentStage, to: RecruitmentStage, options: AssertTransitionOptions = {}): void {
  if (isValidTransition(from, to)) return;
  if (options.override) return;
  throw new InvalidStageTransitionError(from, to);
}
