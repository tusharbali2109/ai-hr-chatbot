import { describe, it, expect } from "vitest";
import { validateJobForPublish, isRetryable } from "@/lib/jobboards/logic";

describe("validateJobForPublish", () => {
  it("passes for an approved job with title and description", () => {
    const result = validateJobForPublish({
      jd_status: "APPROVED",
      title: "Senior Backend Engineer",
      description: "About the role...",
    });
    expect(result).toEqual({ valid: true, errors: [] });
  });

  it("rejects a job whose JD is not approved", () => {
    const result = validateJobForPublish({
      jd_status: "READY_FOR_REVIEW",
      title: "Senior Backend Engineer",
      description: "About the role...",
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("The job description must be approved before publishing.");
  });

  it("rejects missing title and description independently", () => {
    const result = validateJobForPublish({ jd_status: "APPROVED", title: "  ", description: "" });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Job title is required.");
    expect(result.errors).toContain("Job description is required.");
  });
});

describe("isRetryable", () => {
  it("only FAILED postings are retryable", () => {
    expect(isRetryable("FAILED")).toBe(true);
    expect(isRetryable("PUBLISHED")).toBe(false);
    expect(isRetryable("DRAFT")).toBe(false);
    expect(isRetryable("PUBLISHING")).toBe(false);
    expect(isRetryable("CLOSED")).toBe(false);
  });
});
