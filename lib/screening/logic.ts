import type { RequirementAssessment } from "@/lib/ai/schemas";
import type { ComponentScores, ScreeningConfidence, ScreeningRecommendation } from "@/lib/types/database";

/**
 * Default scoring weights — the single source of truth. Never hardcode
 * these percentages anywhere else; import this constant instead. A future
 * per-job override would replace the default passed into
 * computeWeightedScore, not a second copy of these numbers.
 */
export const DEFAULT_SCORING_WEIGHTS: ComponentScores = {
  required_skills: 0.35,
  experience: 0.2,
  relevant_experience: 0.15,
  jd_semantic_match: 0.15,
  preferred_skills: 0.1,
  education_other: 0.05,
};

export const SCORE_THRESHOLDS = {
  SHORTLIST: 80,
  NEEDS_REVIEW: 60,
} as const;

export function normalizeComponentScore(raw: number): number {
  return Math.max(0, Math.min(100, Math.round(raw)));
}

/**
 * Deterministic weighted sum over the AI's per-dimension component scores —
 * the AI never computes or supplies a final score directly. Missing
 * components (should not happen given the schema requires all six, but
 * handled defensively) are excluded from both the numerator and the weight
 * total, so the score is re-normalized against whatever weight was actually
 * applied rather than silently deflating.
 */
export function computeWeightedScore(
  componentScores: Partial<ComponentScores>,
  weights: ComponentScores = DEFAULT_SCORING_WEIGHTS
): number {
  const keys = Object.keys(weights) as (keyof ComponentScores)[];
  let weightedSum = 0;
  let weightTotal = 0;

  for (const key of keys) {
    const raw = componentScores[key];
    if (raw == null) continue;
    weightedSum += normalizeComponentScore(raw) * weights[key];
    weightTotal += weights[key];
  }

  if (weightTotal === 0) return 0;
  return normalizeComponentScore(weightedSum / weightTotal);
}

export interface MandatoryStatusSummary {
  hasFailure: boolean;
  hasUnknown: boolean;
}

/**
 * A mandatory requirement counts as a "failure" only on an explicit
 * NO_MATCH — never on absence of information. UNKNOWN is tracked
 * separately and must never be treated as a failure (fairness/safety
 * requirement: ambiguous evidence must not silently reject a candidate).
 */
export function evaluateMandatoryStatus(assessments: RequirementAssessment[]): MandatoryStatusSummary {
  return {
    hasFailure: assessments.some((a) => a.status === "NO_MATCH"),
    hasUnknown: assessments.some((a) => a.status === "UNKNOWN"),
  };
}

export interface RecommendationDecision {
  recommendation: ScreeningRecommendation;
  reason: string;
}

function scoreAndMandatoryRecommendation(score: number, mandatoryStatus: MandatoryStatusSummary): RecommendationDecision {
  if (mandatoryStatus.hasFailure) {
    return score >= SCORE_THRESHOLDS.NEEDS_REVIEW
      ? {
          recommendation: "NEEDS_REVIEW",
          reason: "A mandatory requirement was not met, but the overall score is otherwise strong — needs recruiter review.",
        }
      : { recommendation: "REJECTED", reason: "A mandatory requirement was not met and the overall score is low." };
  }

  if (mandatoryStatus.hasUnknown) {
    return {
      recommendation: "NEEDS_REVIEW",
      reason: "At least one mandatory requirement could not be confirmed from the available information — needs recruiter review.",
    };
  }

  if (score >= SCORE_THRESHOLDS.SHORTLIST) {
    return { recommendation: "SHORTLISTED", reason: "Score meets the shortlist threshold with all mandatory requirements met." };
  }
  if (score >= SCORE_THRESHOLDS.NEEDS_REVIEW) {
    return { recommendation: "NEEDS_REVIEW", reason: "Score falls in the review band." };
  }
  return { recommendation: "REJECTED", reason: "Score falls below the review threshold with no ambiguous mandatory requirements." };
}

/**
 * The decision layer: score + mandatory-requirement status + AI confidence
 * -> a final recommendation. A failed mandatory requirement caps the
 * outcome at NEEDS_REVIEW (never auto-SHORTLISTED, even at a high score).
 * An unknown mandatory requirement also caps at NEEDS_REVIEW (never
 * auto-REJECTED). Low AI confidence never turns an outcome into REJECTED
 * on its own — it downgrades a would-be REJECTED to NEEDS_REVIEW instead.
 */
export function decideRecommendation(
  score: number,
  mandatoryStatus: MandatoryStatusSummary,
  confidence: ScreeningConfidence
): RecommendationDecision {
  const base = scoreAndMandatoryRecommendation(score, mandatoryStatus);

  if (base.recommendation === "REJECTED" && confidence === "LOW") {
    return {
      recommendation: "NEEDS_REVIEW",
      reason: "Score and mandatory requirements point toward rejection, but AI confidence was low — routed to review instead of auto-rejecting.",
    };
  }

  return base;
}
