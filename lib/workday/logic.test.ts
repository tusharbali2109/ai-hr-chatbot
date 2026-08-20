import { describe, it, expect } from "vitest";
import { computeOverallScore, decideWorkdayRecommendation } from "@/lib/workday/logic";

describe("computeOverallScore", () => {
  it("averages per-task scores", () => {
    expect(computeOverallScore([{ score: 80 }, { score: 60 }])).toBe(70);
  });

  it("returns 0 for no tasks", () => {
    expect(computeOverallScore([])).toBe(0);
  });

  it("clamps out-of-range scores before averaging", () => {
    expect(computeOverallScore([{ score: 150 }, { score: -20 }])).toBe(50);
  });
});

describe("decideWorkdayRecommendation", () => {
  it("advances a high score with high confidence throughout", () => {
    const result = decideWorkdayRecommendation(85, ["HIGH", "HIGH"]);
    expect(result.recommendation).toBe("ADVANCE");
  });

  it("rejects a low score with high confidence throughout", () => {
    const result = decideWorkdayRecommendation(30, ["HIGH", "MEDIUM"]);
    expect(result.recommendation).toBe("REJECT");
  });

  it("routes a mid-range score to needs review", () => {
    const result = decideWorkdayRecommendation(60, ["HIGH", "HIGH"]);
    expect(result.recommendation).toBe("NEEDS_REVIEW");
  });

  it("caps a high score at needs review when any task had low confidence", () => {
    const result = decideWorkdayRecommendation(90, ["HIGH", "LOW"]);
    expect(result.recommendation).toBe("NEEDS_REVIEW");
    expect(result.reason).toMatch(/confidence/i);
  });

  it("caps a low score at needs review (never silently rejects) when confidence is low", () => {
    const result = decideWorkdayRecommendation(20, ["LOW"]);
    expect(result.recommendation).toBe("NEEDS_REVIEW");
  });
});
