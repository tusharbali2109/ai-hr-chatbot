import { describe, it, expect } from "vitest";
import {
  DEFAULT_SCORING_WEIGHTS,
  SCORE_THRESHOLDS,
  normalizeComponentScore,
  computeWeightedScore,
  evaluateMandatoryStatus,
  decideRecommendation,
} from "@/lib/screening/logic";
import type { RequirementAssessment } from "@/lib/ai/schemas";

function assessment(overrides: Partial<RequirementAssessment> = {}): RequirementAssessment {
  return { requirement: "Python", status: "MATCH", evidence: "Used Python for 4 years.", ...overrides };
}

describe("normalizeComponentScore", () => {
  it("clamps below 0 and above 100", () => {
    expect(normalizeComponentScore(-10)).toBe(0);
    expect(normalizeComponentScore(150)).toBe(100);
  });
  it("rounds fractional values", () => {
    expect(normalizeComponentScore(87.6)).toBe(88);
  });
});

describe("computeWeightedScore", () => {
  it("applies the exact default weights", () => {
    const scores = {
      required_skills: 100,
      experience: 100,
      relevant_experience: 100,
      jd_semantic_match: 100,
      preferred_skills: 100,
      education_other: 100,
    };
    expect(computeWeightedScore(scores)).toBe(100);
  });

  it("computes a correct weighted total for mixed scores", () => {
    const scores = {
      required_skills: 92,
      experience: 90,
      relevant_experience: 85,
      jd_semantic_match: 88,
      preferred_skills: 70,
      education_other: 60,
    };
    const expected = Math.round(
      92 * DEFAULT_SCORING_WEIGHTS.required_skills +
        90 * DEFAULT_SCORING_WEIGHTS.experience +
        85 * DEFAULT_SCORING_WEIGHTS.relevant_experience +
        88 * DEFAULT_SCORING_WEIGHTS.jd_semantic_match +
        70 * DEFAULT_SCORING_WEIGHTS.preferred_skills +
        60 * DEFAULT_SCORING_WEIGHTS.education_other
    );
    expect(computeWeightedScore(scores)).toBe(expected);
  });

  it("respects custom weights", () => {
    const scores = { required_skills: 100, experience: 0, relevant_experience: 0, jd_semantic_match: 0, preferred_skills: 0, education_other: 0 };
    const weights = { required_skills: 1, experience: 0, relevant_experience: 0, jd_semantic_match: 0, preferred_skills: 0, education_other: 0 };
    expect(computeWeightedScore(scores, weights)).toBe(100);
  });

  it("re-normalizes against the weight actually applied when components are missing", () => {
    // Only required_skills (weight 0.35) present at 100 -> re-normalized to 100, not 35.
    expect(computeWeightedScore({ required_skills: 100 })).toBe(100);
  });

  it("returns 0 when no component scores are present", () => {
    expect(computeWeightedScore({})).toBe(0);
  });
});

describe("evaluateMandatoryStatus", () => {
  it("has no failure/unknown when everything is a MATCH", () => {
    const result = evaluateMandatoryStatus([assessment(), assessment({ requirement: "FastAPI" })]);
    expect(result).toEqual({ hasFailure: false, hasUnknown: false });
  });

  it("flags a failure only on explicit NO_MATCH", () => {
    const result = evaluateMandatoryStatus([assessment({ status: "NO_MATCH" })]);
    expect(result.hasFailure).toBe(true);
  });

  it("treats UNKNOWN separately from failure — never a failure", () => {
    const result = evaluateMandatoryStatus([assessment({ status: "UNKNOWN" })]);
    expect(result).toEqual({ hasFailure: false, hasUnknown: true });
  });

  it("detects both a failure and an unknown across different requirements", () => {
    const result = evaluateMandatoryStatus([assessment({ status: "NO_MATCH" }), assessment({ requirement: "AWS", status: "UNKNOWN" })]);
    expect(result).toEqual({ hasFailure: true, hasUnknown: true });
  });
});

const clean = { hasFailure: false, hasUnknown: false };
const failed = { hasFailure: true, hasUnknown: false };
const unknown = { hasFailure: false, hasUnknown: true };

describe("decideRecommendation — full decision matrix", () => {
  it("high score + clean mandatory + high confidence -> SHORTLISTED", () => {
    expect(decideRecommendation(90, clean, "HIGH").recommendation).toBe("SHORTLISTED");
  });

  it("mid score + clean mandatory -> NEEDS_REVIEW", () => {
    expect(decideRecommendation(70, clean, "HIGH").recommendation).toBe("NEEDS_REVIEW");
  });

  it("low score + clean mandatory + high confidence -> REJECTED", () => {
    expect(decideRecommendation(40, clean, "HIGH").recommendation).toBe("REJECTED");
  });

  it("low score + clean mandatory + LOW confidence -> downgraded to NEEDS_REVIEW, never REJECTED", () => {
    expect(decideRecommendation(40, clean, "LOW").recommendation).toBe("NEEDS_REVIEW");
  });

  it("high score but a FAILED mandatory -> capped at NEEDS_REVIEW, never SHORTLISTED", () => {
    expect(decideRecommendation(95, failed, "HIGH").recommendation).toBe("NEEDS_REVIEW");
  });

  it("low score with a FAILED mandatory -> REJECTED", () => {
    expect(decideRecommendation(30, failed, "HIGH").recommendation).toBe("REJECTED");
  });

  it("low score with a FAILED mandatory but LOW confidence -> downgraded to NEEDS_REVIEW", () => {
    expect(decideRecommendation(30, failed, "LOW").recommendation).toBe("NEEDS_REVIEW");
  });

  it("high score but an UNKNOWN mandatory -> capped at NEEDS_REVIEW, never SHORTLISTED", () => {
    expect(decideRecommendation(95, unknown, "HIGH").recommendation).toBe("NEEDS_REVIEW");
  });

  it("low score with an UNKNOWN mandatory -> NEEDS_REVIEW, never REJECTED regardless of confidence", () => {
    expect(decideRecommendation(20, unknown, "HIGH").recommendation).toBe("NEEDS_REVIEW");
    expect(decideRecommendation(20, unknown, "LOW").recommendation).toBe("NEEDS_REVIEW");
  });

  it("boundary: exactly the SHORTLIST threshold shortlists", () => {
    expect(decideRecommendation(SCORE_THRESHOLDS.SHORTLIST, clean, "HIGH").recommendation).toBe("SHORTLISTED");
  });

  it("boundary: exactly the NEEDS_REVIEW threshold is NEEDS_REVIEW, not REJECTED", () => {
    expect(decideRecommendation(SCORE_THRESHOLDS.NEEDS_REVIEW, clean, "HIGH").recommendation).toBe("NEEDS_REVIEW");
  });

  it("boundary: one point below the NEEDS_REVIEW threshold rejects (with high confidence)", () => {
    expect(decideRecommendation(SCORE_THRESHOLDS.NEEDS_REVIEW - 1, clean, "HIGH").recommendation).toBe("REJECTED");
  });

  it("every decision includes a human-readable reason", () => {
    expect(decideRecommendation(90, clean, "HIGH").reason.length).toBeGreaterThan(0);
    expect(decideRecommendation(95, failed, "HIGH").reason.length).toBeGreaterThan(0);
  });
});
