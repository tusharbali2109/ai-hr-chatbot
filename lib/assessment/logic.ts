import type { DeadlineUnit, EvaluationConfidence, AssessmentRecommendation } from "@/lib/types/database";
import type { RecruitmentStage } from "@/lib/stages";

export const PASSING_SCORE_DEFAULT = 70;

export interface DeadlineConfig {
  unit: DeadlineUnit;
  value: number;
}

/** Recruiter-configurable deadline, never hardcoded — turns {unit, value}
 * into an absolute ISO deadline relative to assignment time. */
export function computeDeadline(assignedAt: string | Date, config: DeadlineConfig): string {
  const base = new Date(assignedAt);
  const ms = config.unit === "HOURS" ? config.value * 60 * 60 * 1000 : config.value * 24 * 60 * 60 * 1000;
  return new Date(base.getTime() + ms).toISOString();
}

export function isExpired(deadline: string, now: string | Date = new Date()): boolean {
  return new Date(deadline).getTime() < new Date(now).getTime();
}

export const DEADLINE_PRESETS: { label: string; config: DeadlineConfig }[] = [
  { label: "24 hours", config: { unit: "HOURS", value: 24 } },
  { label: "48 hours", config: { unit: "HOURS", value: 48 } },
  { label: "72 hours", config: { unit: "HOURS", value: 72 } },
  { label: "5 days", config: { unit: "DAYS", value: 5 } },
  { label: "7 days", config: { unit: "DAYS", value: 7 } },
];

export function formatDeadlineConfig(config: DeadlineConfig): string {
  const unit = config.unit === "HOURS" ? "hour" : "day";
  return `${config.value} ${unit}${config.value === 1 ? "" : "s"}`;
}

export interface QuestionEvaluationInput {
  score: number;
  max_score: number;
}

/**
 * Deterministic scoring rule (spec §14): earned_points / total_points × 100.
 * The AI never emits a whole-assessment score directly — only per-question
 * scores, summed here.
 */
export function computeFinalScore(evaluations: QuestionEvaluationInput[]): number {
  const totalPoints = evaluations.reduce((sum, e) => sum + e.max_score, 0);
  if (totalPoints <= 0) return 0;
  const earnedPoints = evaluations.reduce((sum, e) => sum + Math.max(0, Math.min(e.score, e.max_score)), 0);
  return Math.max(0, Math.min(100, Math.round((earnedPoints / totalPoints) * 1000) / 10));
}

export interface RecommendationDecision {
  recommendation: AssessmentRecommendation;
  reason: string;
}

/**
 * score vs passing_score decides SHORTLIST/REJECT; low-confidence AI
 * evaluations or flagged integrity signals cap the outcome at
 * NEEDS_REVIEW — never auto-reject purely on suspicion (spec §18), and
 * never let a single low-confidence question silently pass a candidate
 * who otherwise wouldn't clear the bar without a human look.
 */
export function decideRecommendation(
  score: number,
  passingScore: number,
  evaluationConfidences: EvaluationConfidence[],
  integrityFlagged: boolean = false
): RecommendationDecision {
  const hasLowConfidence = evaluationConfidences.some((c) => c === "LOW");

  if (integrityFlagged) {
    return { recommendation: "NEEDS_REVIEW", reason: "Integrity signals on this submission need recruiter review before a decision." };
  }

  if (hasLowConfidence) {
    return {
      recommendation: "NEEDS_REVIEW",
      reason: "At least one answer could not be graded with high confidence — routed to review instead of an automated decision.",
    };
  }

  if (score >= passingScore) {
    return { recommendation: "SHORTLIST", reason: `Score ${score} meets the passing threshold of ${passingScore}.` };
  }
  return { recommendation: "REJECT", reason: `Score ${score} falls below the passing threshold of ${passingScore}.` };
}

/** Phase 8 introduces ASSESSMENT_SHORTLISTED as a first-class stage (was
 * temporarily mapped to the unrelated FINAL_SHORTLISTED value in Phase 6,
 * before Phase 8's real pipeline existed). */
export function mapAssessmentRecommendationToStage(recommendation: AssessmentRecommendation): RecruitmentStage {
  if (recommendation === "SHORTLIST") return "ASSESSMENT_SHORTLISTED";
  if (recommendation === "REJECT") return "REJECTED";
  return "NEEDS_REVIEW";
}
