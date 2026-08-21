import { normalizePhone } from "@/lib/ingestion/logic";
import type { InterviewEvaluation } from "@/lib/ai/schemas";
import type { AnswerSufficiency, InterviewComponentScores, InterviewRecommendation } from "@/lib/types/database";
import type { RecruitmentStage } from "@/lib/stages";

/** Converts a finalized interview's recommendation + status into the next
 * pipeline stage. Lives here (not in lib/interview/agent.ts) so both the
 * session-bound agent trigger path (mock provider's synchronous
 * completion) and the Twilio voice webhook (no session, real calls'
 * completion happens entirely inside the webhook) can call the exact same
 * pure logic without importing each other. */
export function mapRecommendationToStage(recommendation: string | null, status: string): RecruitmentStage {
  // Consent decline (and any not-yet-final status) stays at AI_INTERVIEW —
  // never silently rejected. The recruiter decides the next step.
  if (status !== "COMPLETED") return "AI_INTERVIEW";
  if (recommendation === "INTERVIEW_SHORTLISTED") return "INTERVIEW_SHORTLISTED";
  if (recommendation === "REJECTED") return "REJECTED";
  return "NEEDS_REVIEW";
}

/** The AI's structured output uses snake_case (matching the rest of
 * lib/ai/schemas.ts's convention); the app's internal ComponentScores type
 * uses camelCase. This is the one place that mapping happens. */
export function mapInterviewComponentScores(raw: InterviewEvaluation["component_scores"]): InterviewComponentScores {
  return {
    technicalKnowledge: raw.technical_knowledge,
    problemSolving: raw.problem_solving,
    relevantExperience: raw.relevant_experience,
    roleSpecificSkills: raw.role_specific_skills,
    communicationClarity: raw.communication_clarity,
  };
}

/**
 * Default interview rubric weights — the single source of truth. Never
 * hardcode these percentages anywhere else; import this constant instead.
 */
export const DEFAULT_INTERVIEW_RUBRIC_WEIGHTS: InterviewComponentScores = {
  technicalKnowledge: 0.3,
  problemSolving: 0.2,
  relevantExperience: 0.2,
  roleSpecificSkills: 0.2,
  communicationClarity: 0.1,
};

export const INTERVIEW_SCORE_THRESHOLDS = {
  SHORTLIST: 75,
  NEEDS_REVIEW: 55,
} as const;

/** Every conservative default from the spec, in one named, exported object
 * — nothing about calling behavior is hardcoded elsewhere. */
export const DEFAULT_INTERVIEW_CONFIG = {
  minDurationMinutes: 15,
  maxDurationMinutes: 30,
  minQuestions: 8,
  maxQuestions: 12,
  maxFollowupsPerQuestion: 2,
  maxCallAttempts: 3,
  recordingEnabled: false,
  automaticCallingEnabled: false,
} as const;

export function normalizeInterviewComponentScore(raw: number): number {
  return Math.max(0, Math.min(100, Math.round(raw)));
}

/** Deterministic weighted sum over the AI's per-dimension component scores
 * — mirrors lib/screening/logic.ts's computeWeightedScore exactly. The AI
 * never computes or supplies a final interview score directly. */
export function computeWeightedInterviewScore(
  componentScores: Partial<InterviewComponentScores>,
  weights: InterviewComponentScores = DEFAULT_INTERVIEW_RUBRIC_WEIGHTS
): number {
  const keys = Object.keys(weights) as (keyof InterviewComponentScores)[];
  let weightedSum = 0;
  let weightTotal = 0;

  for (const key of keys) {
    const raw = componentScores[key];
    if (raw == null) continue;
    weightedSum += normalizeInterviewComponentScore(raw) * weights[key];
    weightTotal += weights[key];
  }

  if (weightTotal === 0) return 0;
  return normalizeInterviewComponentScore(weightedSum / weightTotal);
}

export interface CoverageStats {
  questionsAsked: number;
  plannedQuestions: number;
}

export const MIN_COVERAGE_RATIO = 0.5;

/** A call that ended too early (dropped, cut short) doesn't have enough
 * evidence to score confidently — never silently scored as if complete. */
export function isCoverageSufficient(coverage: CoverageStats): boolean {
  if (coverage.plannedQuestions <= 0) return false;
  return coverage.questionsAsked / coverage.plannedQuestions >= MIN_COVERAGE_RATIO;
}

export interface InterviewRecommendationDecision {
  recommendation: InterviewRecommendation;
  reason: string;
}

/**
 * The decision layer: score + question coverage -> a final recommendation.
 * Consent decline is handled entirely outside this function (the agent
 * sets interview status CONSENT_DECLINED and never calls this at all —
 * declining is never scored as a rejection). Insufficient coverage caps
 * the outcome at NEEDS_REVIEW regardless of the partial score, mirroring
 * the screening agent's "ambiguous evidence -> NEEDS_REVIEW, never
 * silently reject" principle.
 */
export function decideInterviewRecommendation(score: number, coverage: CoverageStats): InterviewRecommendationDecision {
  if (!isCoverageSufficient(coverage)) {
    return {
      recommendation: "NEEDS_REVIEW",
      reason: "The interview ended before enough questions were covered to confidently score — needs recruiter review.",
    };
  }

  if (score >= INTERVIEW_SCORE_THRESHOLDS.SHORTLIST) {
    return { recommendation: "INTERVIEW_SHORTLISTED", reason: "Score meets the interview shortlist threshold with sufficient question coverage." };
  }
  if (score >= INTERVIEW_SCORE_THRESHOLDS.NEEDS_REVIEW) {
    return { recommendation: "NEEDS_REVIEW", reason: "Score falls in the review band." };
  }
  return { recommendation: "REJECTED", reason: "Score falls below the review threshold with sufficient question coverage to be confident." };
}

export interface PlanSection {
  name: string;
  targetMinutes: number;
  targetQuestions: number;
  category?: "MANDATORY" | "PREFERRED";
}

const INTRO_MINUTES = 2;
const EXPERIENCE_MINUTES = 4;
const CLOSING_MINUTES = 2;

/** Turns screening_criteria's mandatory/preferred skills into a job-specific
 * interview plan — never a generic script. Pure and testable without AI. */
export function buildInterviewPlanSections(
  mandatorySkills: string[],
  preferredSkills: string[],
  targetTotalMinutes: number = 20
): PlanSection[] {
  const reserved = INTRO_MINUTES + EXPERIENCE_MINUTES + CLOSING_MINUTES;
  const skillBudget = Math.max(targetTotalMinutes - reserved, 0);
  const skillSectionCount = mandatorySkills.length + preferredSkills.length;
  const perSkillMinutes = skillSectionCount > 0 ? skillBudget / skillSectionCount : 0;

  const sections: PlanSection[] = [
    { name: "Introduction", targetMinutes: INTRO_MINUTES, targetQuestions: 0 },
    { name: "Experience", targetMinutes: EXPERIENCE_MINUTES, targetQuestions: 2 },
  ];

  for (const skill of mandatorySkills) {
    sections.push({ name: skill, targetMinutes: Math.round(perSkillMinutes), targetQuestions: 1, category: "MANDATORY" });
  }
  for (const skill of preferredSkills) {
    sections.push({ name: skill, targetMinutes: Math.round(perSkillMinutes), targetQuestions: 1, category: "PREFERRED" });
  }

  sections.push({ name: "Candidate Questions", targetMinutes: CLOSING_MINUTES, targetQuestions: 0 });

  return sections;
}

const FALLBACK_COUNTRY_CODE = "91";

/**
 * Builds on the existing normalizePhone (digit-stripping) with E.164
 * formatting for outbound dialing. Already-`+`-prefixed numbers pass
 * through digit-normalized; a bare 10-digit number gets the configured
 * default country code (DEFAULT_COUNTRY_CODE env var, falling back to 91 /
 * India, matching this app's existing en-IN convention) prepended;
 * anything that still doesn't look like a plausible number returns null so
 * the caller blocks triggering with a clear error rather than guessing
 * further.
 */
export function formatE164(rawPhone: string | null): string | null {
  const digits = normalizePhone(rawPhone);
  if (!digits) return null;

  if (rawPhone && rawPhone.trim().startsWith("+")) {
    return `+${digits}`;
  }
  if (digits.length === 10) {
    const countryCode = process.env.DEFAULT_COUNTRY_CODE || FALLBACK_COUNTRY_CODE;
    return `+${countryCode}${digits}`;
  }
  if (digits.length > 10 && digits.length <= 15) {
    return `+${digits}`;
  }
  return null;
}

export function isAnswerSufficient(sufficiency: AnswerSufficiency): boolean {
  return sufficiency === "SUFFICIENT";
}

export function hasExceededFollowupLimit(
  followupCount: number,
  maxFollowups: number = DEFAULT_INTERVIEW_CONFIG.maxFollowupsPerQuestion
): boolean {
  return followupCount >= maxFollowups;
}

export type ConsentInterpretation = "GRANTED" | "DECLINED" | "UNCLEAR";

const CONSENT_DECLINE_PATTERN = /\b(no|nope|not\s+now|stop|decline|don't|do\s+not|can't|cannot|not\s+comfortable|not\s+a\s+good\s+time)\b/i;
const CONSENT_GRANT_PATTERN = /\b(yes|yeah|yep|sure|okay|ok|continue|proceed|fine|go\s+ahead|comfortable)\b/i;

/** Keyword-based interpretation of the candidate's spoken response to the
 * opening consent question. Checks decline patterns first so a phrase like
 * "no, I'm not comfortable" is never misread as consent. Anything that
 * matches neither pattern is UNCLEAR — the caller should ask again rather
 * than guess. */
export function interpretConsentResponse(text: string): ConsentInterpretation {
  const trimmed = text.trim();
  if (!trimmed) return "UNCLEAR";
  if (CONSENT_DECLINE_PATTERN.test(trimmed)) return "DECLINED";
  if (CONSENT_GRANT_PATTERN.test(trimmed)) return "GRANTED";
  return "UNCLEAR";
}
