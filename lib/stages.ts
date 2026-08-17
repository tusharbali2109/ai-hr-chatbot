export const RECRUITMENT_STAGES = [
  "APPLIED",
  "AI_SCREENING",
  "NEEDS_REVIEW",
  "SHORTLISTED",
  "SKILL_VERIFICATION",
  "AI_INTERVIEW",
  "INTERVIEW_SHORTLISTED",
  "ASSESSMENT_SENT",
  "ASSESSMENT_SUBMITTED",
  "ASSESSMENT_EVALUATED",
  "ASSESSMENT_SHORTLISTED",
  "FINAL_REVIEW",
  "FINAL_SHORTLISTED",
  "INTERVIEW_SCHEDULED",
  "FINAL_INTERVIEW",
  "SELECTED",
  "REJECTED",
] as const;

export type RecruitmentStage = (typeof RECRUITMENT_STAGES)[number];

/** The spec §39 canonical pipeline. FINAL_SHORTLISTED/FINAL_INTERVIEW/
 * SKILL_VERIFICATION/ASSESSMENT_EVALUATED remain legal RecruitmentStage
 * values (any already-stored application row stays valid, and the optional
 * Phase 7 final-round-interview side path still uses INTERVIEW_SCHEDULED/
 * FINAL_INTERVIEW) but are no longer primary pipeline columns. */
export const PIPELINE_STAGES: RecruitmentStage[] = [
  "APPLIED",
  "AI_SCREENING",
  "NEEDS_REVIEW",
  "SHORTLISTED",
  "AI_INTERVIEW",
  "INTERVIEW_SHORTLISTED",
  "ASSESSMENT_SENT",
  "ASSESSMENT_SHORTLISTED",
  "FINAL_REVIEW",
  "SELECTED",
];

export const STAGE_META: Record<
  RecruitmentStage,
  { label: string; description: string; tone: "neutral" | "info" | "success" | "warning" | "danger" }
> = {
  APPLIED: { label: "Applied", description: "Application received", tone: "neutral" },
  AI_SCREENING: { label: "AI Screening", description: "Automated resume screening", tone: "info" },
  NEEDS_REVIEW: { label: "Needs Review", description: "AI screening was inconclusive — recruiter review required", tone: "warning" },
  SHORTLISTED: { label: "Shortlisted", description: "Passed screening", tone: "info" },
  SKILL_VERIFICATION: { label: "Skill Verification", description: "Verifying claimed skills", tone: "info" },
  AI_INTERVIEW: { label: "AI Interview", description: "AI voice/chat interview", tone: "warning" },
  INTERVIEW_SHORTLISTED: { label: "Interview Shortlisted", description: "Passed AI interview", tone: "info" },
  ASSESSMENT_SENT: { label: "Assessment Sent", description: "Skills assessment sent", tone: "warning" },
  ASSESSMENT_SUBMITTED: { label: "Assessment Submitted", description: "Candidate submitted assessment", tone: "info" },
  ASSESSMENT_EVALUATED: { label: "Assessment Evaluated", description: "Assessment scored", tone: "info" },
  ASSESSMENT_SHORTLISTED: { label: "Assessment Shortlisted", description: "Passed assessment evaluation", tone: "info" },
  FINAL_REVIEW: { label: "Final Review", description: "Final evaluation pending human approval", tone: "warning" },
  FINAL_SHORTLISTED: { label: "Final Shortlisted", description: "Shortlisted for final round", tone: "info" },
  INTERVIEW_SCHEDULED: { label: "Interview Scheduled", description: "Final interview scheduled", tone: "warning" },
  FINAL_INTERVIEW: { label: "Final Interview", description: "In final interview round", tone: "warning" },
  SELECTED: { label: "Selected", description: "Offer extended / selected", tone: "success" },
  REJECTED: { label: "Rejected", description: "Not moving forward", tone: "danger" },
};

export function isRecruitmentStage(value: string): value is RecruitmentStage {
  return (RECRUITMENT_STAGES as readonly string[]).includes(value);
}
