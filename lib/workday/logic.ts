import type { EvaluationConfidence } from "@/lib/types/database";

export type WorkdayRecommendation = "ADVANCE" | "REJECT" | "NEEDS_REVIEW";

export interface TaskScoreInput {
  score: number; // 0-100
}

/** Deterministic aggregation — the AI never emits a whole-session score
 * directly, only per-task scores (mirrors lib/assessment/logic.ts's
 * computeFinalScore). Simple average: every task in a Digital Workday
 * carries equal weight, there is no per-task points/weight concept in the
 * schema (unlike assessment questions). */
export function computeOverallScore(taskScores: TaskScoreInput[]): number {
  if (taskScores.length === 0) return 0;
  const sum = taskScores.reduce((acc, t) => acc + Math.max(0, Math.min(100, t.score)), 0);
  return Math.round((sum / taskScores.length) * 10) / 10;
}

export interface WorkdayRecommendationDecision {
  recommendation: WorkdayRecommendation;
  reason: string;
}

const ADVANCE_THRESHOLD = 75;
const REJECT_THRESHOLD = 50;

/**
 * score vs fixed thresholds decides ADVANCE/REJECT; any low-confidence
 * per-task evaluation caps the outcome at NEEDS_REVIEW instead of an
 * automated decision — same rule as lib/assessment/logic.ts's
 * decideRecommendation, so a submission the AI itself found ambiguous to
 * grade never silently becomes a REJECT.
 */
export function decideWorkdayRecommendation(score: number, taskConfidences: EvaluationConfidence[]): WorkdayRecommendationDecision {
  const hasLowConfidence = taskConfidences.some((c) => c === "LOW");

  if (hasLowConfidence) {
    return {
      recommendation: "NEEDS_REVIEW",
      reason: "At least one task could not be evaluated with high confidence — routed to review instead of an automated decision.",
    };
  }

  if (score >= ADVANCE_THRESHOLD) {
    return { recommendation: "ADVANCE", reason: `Overall score ${score} meets the advance threshold (${ADVANCE_THRESHOLD}).` };
  }
  if (score < REJECT_THRESHOLD) {
    return { recommendation: "REJECT", reason: `Overall score ${score} is below the reject threshold (${REJECT_THRESHOLD}).` };
  }
  return { recommendation: "NEEDS_REVIEW", reason: `Overall score ${score} is between ${REJECT_THRESHOLD} and ${ADVANCE_THRESHOLD} — needs recruiter judgment.` };
}
