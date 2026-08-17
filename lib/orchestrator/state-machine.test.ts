import { describe, it, expect } from "vitest";
import { isValidTransition, assertValidTransition, InvalidStageTransitionError } from "@/lib/orchestrator/state-machine";

describe("isValidTransition", () => {
  it("allows every documented forward-flow transition", () => {
    expect(isValidTransition("APPLIED", "AI_SCREENING")).toBe(true);
    expect(isValidTransition("AI_SCREENING", "SHORTLISTED")).toBe(true);
    expect(isValidTransition("SHORTLISTED", "AI_INTERVIEW")).toBe(true);
    expect(isValidTransition("AI_INTERVIEW", "INTERVIEW_SHORTLISTED")).toBe(true);
    expect(isValidTransition("INTERVIEW_SHORTLISTED", "ASSESSMENT_SENT")).toBe(true);
    expect(isValidTransition("ASSESSMENT_SENT", "ASSESSMENT_SUBMITTED")).toBe(true);
    expect(isValidTransition("ASSESSMENT_SUBMITTED", "ASSESSMENT_SHORTLISTED")).toBe(true);
    expect(isValidTransition("ASSESSMENT_SHORTLISTED", "FINAL_REVIEW")).toBe(true);
    expect(isValidTransition("FINAL_REVIEW", "SELECTED")).toBe(true);
  });

  it("allows a same-stage no-op transition", () => {
    expect(isValidTransition("AI_SCREENING", "AI_SCREENING")).toBe(true);
  });

  it("allows NEEDS_REVIEW to advance to any stage — the recruiter recovery state", () => {
    expect(isValidTransition("NEEDS_REVIEW", "SHORTLISTED")).toBe(true);
    expect(isValidTransition("NEEDS_REVIEW", "SELECTED")).toBe(true);
    expect(isValidTransition("NEEDS_REVIEW", "REJECTED")).toBe(true);
  });

  it("blocks the spec's literal illegal example: REJECTED -> AI_INTERVIEW", () => {
    expect(isValidTransition("REJECTED", "AI_INTERVIEW")).toBe(false);
  });

  it("treats SELECTED and REJECTED as terminal (no forward transitions)", () => {
    expect(isValidTransition("SELECTED", "FINAL_REVIEW")).toBe(false);
    expect(isValidTransition("REJECTED", "SELECTED")).toBe(false);
  });

  it("blocks skipping stages, e.g. APPLIED directly to SELECTED", () => {
    expect(isValidTransition("APPLIED", "SELECTED")).toBe(false);
  });
});

describe("assertValidTransition", () => {
  it("does not throw for a valid transition", () => {
    expect(() => assertValidTransition("APPLIED", "AI_SCREENING")).not.toThrow();
  });

  it("throws InvalidStageTransitionError for an illegal transition without override", () => {
    expect(() => assertValidTransition("REJECTED", "AI_INTERVIEW")).toThrow(InvalidStageTransitionError);
  });

  it("does not throw for an illegal transition when override is explicitly true", () => {
    expect(() => assertValidTransition("REJECTED", "AI_INTERVIEW", { override: true })).not.toThrow();
  });
});
