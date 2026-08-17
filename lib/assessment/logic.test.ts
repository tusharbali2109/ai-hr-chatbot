import { describe, it, expect } from "vitest";
import {
  computeDeadline,
  isExpired,
  formatDeadlineConfig,
  computeFinalScore,
  decideRecommendation,
  mapAssessmentRecommendationToStage,
} from "@/lib/assessment/logic";

describe("computeDeadline", () => {
  it("adds hours correctly", () => {
    const result = computeDeadline("2026-08-14T00:00:00.000Z", { unit: "HOURS", value: 24 });
    expect(result).toBe("2026-08-15T00:00:00.000Z");
  });

  it("adds days correctly", () => {
    const result = computeDeadline("2026-08-14T00:00:00.000Z", { unit: "DAYS", value: 3 });
    expect(result).toBe("2026-08-17T00:00:00.000Z");
  });

  it("supports all preset units (48h, 72h, 5d, 7d, custom)", () => {
    expect(computeDeadline("2026-01-01T00:00:00.000Z", { unit: "HOURS", value: 48 })).toBe("2026-01-03T00:00:00.000Z");
    expect(computeDeadline("2026-01-01T00:00:00.000Z", { unit: "HOURS", value: 72 })).toBe("2026-01-04T00:00:00.000Z");
    expect(computeDeadline("2026-01-01T00:00:00.000Z", { unit: "DAYS", value: 5 })).toBe("2026-01-06T00:00:00.000Z");
    expect(computeDeadline("2026-01-01T00:00:00.000Z", { unit: "DAYS", value: 7 })).toBe("2026-01-08T00:00:00.000Z");
    expect(computeDeadline("2026-01-01T00:00:00.000Z", { unit: "HOURS", value: 10 })).toBe("2026-01-01T10:00:00.000Z");
  });
});

describe("isExpired", () => {
  it("is expired when deadline is in the past", () => {
    expect(isExpired("2026-01-01T00:00:00.000Z", "2026-01-02T00:00:00.000Z")).toBe(true);
  });
  it("is not expired when deadline is in the future", () => {
    expect(isExpired("2026-01-02T00:00:00.000Z", "2026-01-01T00:00:00.000Z")).toBe(false);
  });
});

describe("formatDeadlineConfig", () => {
  it("pluralizes correctly", () => {
    expect(formatDeadlineConfig({ unit: "HOURS", value: 1 })).toBe("1 hour");
    expect(formatDeadlineConfig({ unit: "HOURS", value: 24 })).toBe("24 hours");
    expect(formatDeadlineConfig({ unit: "DAYS", value: 1 })).toBe("1 day");
    expect(formatDeadlineConfig({ unit: "DAYS", value: 5 })).toBe("5 days");
  });
});

describe("computeFinalScore", () => {
  it("computes earned/total x 100", () => {
    expect(computeFinalScore([{ score: 10, max_score: 10 }, { score: 15, max_score: 20 }, { score: 0, max_score: 10 }])).toBe(62.5);
  });

  it("returns 0 for no questions", () => {
    expect(computeFinalScore([])).toBe(0);
  });

  it("clamps a per-question score that exceeds max_score", () => {
    expect(computeFinalScore([{ score: 999, max_score: 10 }])).toBe(100);
  });

  it("clamps a negative per-question score to 0", () => {
    expect(computeFinalScore([{ score: -5, max_score: 10 }, { score: 10, max_score: 10 }])).toBe(50);
  });

  it("returns 100 for a perfect score", () => {
    expect(computeFinalScore([{ score: 10, max_score: 10 }, { score: 20, max_score: 20 }])).toBe(100);
  });
});

describe("decideRecommendation", () => {
  it("SHORTLIST when score meets passing threshold with high confidence", () => {
    expect(decideRecommendation(85, 70, ["HIGH", "HIGH"]).recommendation).toBe("SHORTLIST");
  });

  it("REJECT when score is below passing threshold with high confidence", () => {
    expect(decideRecommendation(50, 70, ["HIGH", "HIGH"]).recommendation).toBe("REJECT");
  });

  it("boundary: exactly at passing score shortlists", () => {
    expect(decideRecommendation(70, 70, ["HIGH"]).recommendation).toBe("SHORTLIST");
  });

  it("a single LOW confidence evaluation routes to NEEDS_REVIEW even with a passing score", () => {
    expect(decideRecommendation(90, 70, ["HIGH", "LOW"]).recommendation).toBe("NEEDS_REVIEW");
  });

  it("a single LOW confidence evaluation routes to NEEDS_REVIEW instead of REJECT", () => {
    expect(decideRecommendation(30, 70, ["LOW"]).recommendation).toBe("NEEDS_REVIEW");
  });

  it("integrity flag forces NEEDS_REVIEW regardless of score, never auto-reject on suspicion alone", () => {
    expect(decideRecommendation(95, 70, ["HIGH"], true).recommendation).toBe("NEEDS_REVIEW");
    expect(decideRecommendation(10, 70, ["HIGH"], true).recommendation).toBe("NEEDS_REVIEW");
  });

  it("every decision includes a human-readable reason", () => {
    expect(decideRecommendation(85, 70, ["HIGH"]).reason.length).toBeGreaterThan(0);
    expect(decideRecommendation(50, 70, ["HIGH"]).reason.length).toBeGreaterThan(0);
  });
});

describe("mapAssessmentRecommendationToStage", () => {
  it("maps SHORTLIST to ASSESSMENT_SHORTLISTED", () => {
    expect(mapAssessmentRecommendationToStage("SHORTLIST")).toBe("ASSESSMENT_SHORTLISTED");
  });
  it("maps REJECT to REJECTED", () => {
    expect(mapAssessmentRecommendationToStage("REJECT")).toBe("REJECTED");
  });
  it("maps NEEDS_REVIEW to NEEDS_REVIEW", () => {
    expect(mapAssessmentRecommendationToStage("NEEDS_REVIEW")).toBe("NEEDS_REVIEW");
  });
});
