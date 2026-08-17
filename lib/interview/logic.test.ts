import { describe, it, expect } from "vitest";
import {
  DEFAULT_INTERVIEW_RUBRIC_WEIGHTS,
  INTERVIEW_SCORE_THRESHOLDS,
  normalizeInterviewComponentScore,
  computeWeightedInterviewScore,
  isCoverageSufficient,
  decideInterviewRecommendation,
  buildInterviewPlanSections,
  formatE164,
  isAnswerSufficient,
  hasExceededFollowupLimit,
  mapInterviewComponentScores,
  interpretConsentResponse,
  MIN_COVERAGE_RATIO,
} from "@/lib/interview/logic";

describe("normalizeInterviewComponentScore", () => {
  it("clamps below 0 and above 100", () => {
    expect(normalizeInterviewComponentScore(-5)).toBe(0);
    expect(normalizeInterviewComponentScore(200)).toBe(100);
  });
  it("rounds fractional values", () => {
    expect(normalizeInterviewComponentScore(75.5)).toBe(76);
  });
});

describe("computeWeightedInterviewScore", () => {
  it("applies the exact default weights", () => {
    const scores = {
      technicalKnowledge: 100,
      problemSolving: 100,
      relevantExperience: 100,
      roleSpecificSkills: 100,
      communicationClarity: 100,
    };
    expect(computeWeightedInterviewScore(scores)).toBe(100);
  });

  it("computes a correct weighted total for mixed scores", () => {
    const scores = {
      technicalKnowledge: 88,
      problemSolving: 82,
      relevantExperience: 90,
      roleSpecificSkills: 86,
      communicationClarity: 80,
    };
    const expected = Math.round(
      88 * DEFAULT_INTERVIEW_RUBRIC_WEIGHTS.technicalKnowledge +
        82 * DEFAULT_INTERVIEW_RUBRIC_WEIGHTS.problemSolving +
        90 * DEFAULT_INTERVIEW_RUBRIC_WEIGHTS.relevantExperience +
        86 * DEFAULT_INTERVIEW_RUBRIC_WEIGHTS.roleSpecificSkills +
        80 * DEFAULT_INTERVIEW_RUBRIC_WEIGHTS.communicationClarity
    );
    expect(computeWeightedInterviewScore(scores)).toBe(expected);
  });

  it("re-normalizes against the weight actually applied when components are missing", () => {
    expect(computeWeightedInterviewScore({ technicalKnowledge: 100 })).toBe(100);
  });

  it("returns 0 when no component scores are present", () => {
    expect(computeWeightedInterviewScore({})).toBe(0);
  });
});

describe("isCoverageSufficient", () => {
  it("is false with zero planned questions", () => {
    expect(isCoverageSufficient({ questionsAsked: 0, plannedQuestions: 0 })).toBe(false);
  });
  it("is true at exactly the minimum ratio", () => {
    expect(isCoverageSufficient({ questionsAsked: 5, plannedQuestions: 10 })).toBe(true);
    expect(MIN_COVERAGE_RATIO).toBe(0.5);
  });
  it("is false below the minimum ratio", () => {
    expect(isCoverageSufficient({ questionsAsked: 2, plannedQuestions: 10 })).toBe(false);
  });
});

describe("decideInterviewRecommendation", () => {
  const fullCoverage = { questionsAsked: 10, plannedQuestions: 10 };
  const lowCoverage = { questionsAsked: 1, plannedQuestions: 10 };

  it("high score + sufficient coverage -> INTERVIEW_SHORTLISTED", () => {
    expect(decideInterviewRecommendation(90, fullCoverage).recommendation).toBe("INTERVIEW_SHORTLISTED");
  });

  it("mid score + sufficient coverage -> NEEDS_REVIEW", () => {
    expect(decideInterviewRecommendation(65, fullCoverage).recommendation).toBe("NEEDS_REVIEW");
  });

  it("low score + sufficient coverage -> REJECTED", () => {
    expect(decideInterviewRecommendation(30, fullCoverage).recommendation).toBe("REJECTED");
  });

  it("high score but insufficient coverage -> NEEDS_REVIEW, never auto-shortlisted", () => {
    expect(decideInterviewRecommendation(95, lowCoverage).recommendation).toBe("NEEDS_REVIEW");
  });

  it("low score but insufficient coverage -> NEEDS_REVIEW, never auto-rejected", () => {
    expect(decideInterviewRecommendation(10, lowCoverage).recommendation).toBe("NEEDS_REVIEW");
  });

  it("boundary: exactly the SHORTLIST threshold shortlists", () => {
    expect(decideInterviewRecommendation(INTERVIEW_SCORE_THRESHOLDS.SHORTLIST, fullCoverage).recommendation).toBe(
      "INTERVIEW_SHORTLISTED"
    );
  });

  it("boundary: exactly the NEEDS_REVIEW threshold is NEEDS_REVIEW, not REJECTED", () => {
    expect(decideInterviewRecommendation(INTERVIEW_SCORE_THRESHOLDS.NEEDS_REVIEW, fullCoverage).recommendation).toBe(
      "NEEDS_REVIEW"
    );
  });
});

describe("buildInterviewPlanSections", () => {
  it("always includes Introduction, Experience, and Candidate Questions", () => {
    const sections = buildInterviewPlanSections(["Python"], ["Docker"], 20);
    const names = sections.map((s) => s.name);
    expect(names).toContain("Introduction");
    expect(names).toContain("Experience");
    expect(names).toContain("Candidate Questions");
  });

  it("creates one section per mandatory and preferred skill", () => {
    const sections = buildInterviewPlanSections(["Python", "FastAPI"], ["Docker"], 20);
    expect(sections.filter((s) => s.category === "MANDATORY")).toHaveLength(2);
    expect(sections.filter((s) => s.category === "PREFERRED")).toHaveLength(1);
  });

  it("distributes remaining time proportionally across skill sections", () => {
    const sections = buildInterviewPlanSections(["Python", "FastAPI"], [], 20);
    const skillSections = sections.filter((s) => s.category === "MANDATORY");
    expect(skillSections[0].targetMinutes).toBe(skillSections[1].targetMinutes);
  });

  it("handles zero skills without negative time budgets", () => {
    const sections = buildInterviewPlanSections([], [], 5);
    expect(sections.every((s) => s.targetMinutes >= 0)).toBe(true);
  });
});

describe("formatE164", () => {
  it("passes through an already-+-prefixed number, digit-normalized", () => {
    expect(formatE164("+91 98765 43210")).toBe("+919876543210");
  });
  it("prepends the default country code to a bare 10-digit number", () => {
    expect(formatE164("9876543210")).toBe("+919876543210");
  });
  it("assumes a longer bare digit string already includes a country code", () => {
    expect(formatE164("919876543210")).toBe("+919876543210");
  });
  it("returns null for garbage or too-short input", () => {
    expect(formatE164("123")).toBeNull();
    expect(formatE164(null)).toBeNull();
    expect(formatE164("")).toBeNull();
  });
});

describe("isAnswerSufficient", () => {
  it("only SUFFICIENT counts as sufficient", () => {
    expect(isAnswerSufficient("SUFFICIENT")).toBe(true);
    expect(isAnswerSufficient("PARTIAL")).toBe(false);
    expect(isAnswerSufficient("INSUFFICIENT")).toBe(false);
  });
});

describe("hasExceededFollowupLimit", () => {
  it("is false under the limit and true at/over it", () => {
    expect(hasExceededFollowupLimit(0, 2)).toBe(false);
    expect(hasExceededFollowupLimit(1, 2)).toBe(false);
    expect(hasExceededFollowupLimit(2, 2)).toBe(true);
  });
});

describe("mapInterviewComponentScores", () => {
  it("maps the AI's snake_case output to the app's camelCase component scores", () => {
    const mapped = mapInterviewComponentScores({
      technical_knowledge: 88,
      problem_solving: 82,
      relevant_experience: 90,
      role_specific_skills: 86,
      communication_clarity: 80,
    });
    expect(mapped).toEqual({
      technicalKnowledge: 88,
      problemSolving: 82,
      relevantExperience: 90,
      roleSpecificSkills: 86,
      communicationClarity: 80,
    });
  });
});

describe("interpretConsentResponse", () => {
  it("recognizes clear consent", () => {
    expect(interpretConsentResponse("Yes, sure, go ahead.")).toBe("GRANTED");
  });
  it("recognizes a clear decline", () => {
    expect(interpretConsentResponse("No, I'm not comfortable with this.")).toBe("DECLINED");
  });
  it("prefers decline over grant when both patterns are present", () => {
    expect(interpretConsentResponse("No, I don't think so, not now.")).toBe("DECLINED");
  });
  it("returns UNCLEAR for ambiguous or empty input", () => {
    expect(interpretConsentResponse("hmm what")).toBe("UNCLEAR");
    expect(interpretConsentResponse("")).toBe("UNCLEAR");
    expect(interpretConsentResponse("   ")).toBe("UNCLEAR");
  });
});
