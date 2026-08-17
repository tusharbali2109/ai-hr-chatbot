import { describe, it, expect } from "vitest";
import {
  normalizeIngestPayload,
  normalizeEmail,
  normalizePhone,
  matchCandidate,
  decideApplicationOutcome,
  type CandidateMatchCandidate,
} from "@/lib/ingestion/logic";

describe("normalizeIngestPayload", () => {
  it("normalizes platform A's field shape (first_name/last_name, email, phone, resume_url)", () => {
    const result = normalizeIngestPayload(
      {
        first_name: "Asha",
        last_name: "Verma",
        email: "Asha.Verma@Example.com",
        phone: "+91 98765 43210",
        resume_url: "https://example.com/resume.pdf",
      },
      "mock"
    );
    expect(result.name).toBe("Asha Verma");
    expect(result.email).toBe("asha.verma@example.com");
    expect(result.phone).toBe("919876543210");
    expect(result.resume_url).toBe("https://example.com/resume.pdf");
    expect(result.source_platform).toBe("mock");
  });

  it("normalizes platform B's field shape (name, email_address, mobile, cv_url)", () => {
    const result = normalizeIngestPayload(
      {
        name: "Rahul Sharma",
        email_address: "rahul@example.com",
        mobile: "9123456780",
        cv_url: "https://example.com/rahul.pdf",
      },
      "linkedin"
    );
    expect(result.name).toBe("Rahul Sharma");
    expect(result.email).toBe("rahul@example.com");
    expect(result.phone).toBe("9123456780");
    expect(result.resume_url).toBe("https://example.com/rahul.pdf");
    expect(result.source).toBe("linkedin");
  });

  it("falls back to a placeholder name and empty email when fields are missing", () => {
    const result = normalizeIngestPayload({}, "naukri");
    expect(result.name).toBe("Unknown Candidate");
    expect(result.email).toBe("");
    expect(result.source).toBe("job_board");
  });
});

describe("normalizeEmail", () => {
  it("lowercases and trims", () => {
    expect(normalizeEmail("  Foo.Bar@Example.COM  ")).toBe("foo.bar@example.com");
  });
});

describe("normalizePhone", () => {
  it("strips formatting and keeps digits", () => {
    expect(normalizePhone("+91 98765-43210")).toBe("919876543210");
  });
  it("returns null for missing or too-short input", () => {
    expect(normalizePhone(null)).toBeNull();
    expect(normalizePhone("123")).toBeNull();
  });
});

describe("matchCandidate", () => {
  const candidates: CandidateMatchCandidate[] = [
    { id: "c1", email: "known@example.com", phone: "919876543210" },
    { id: "c2", email: "other@example.com", phone: null },
  ];

  it("returns an exact_email match with no review needed", () => {
    const result = matchCandidate({ email: "known@example.com", phone: null }, candidates);
    expect(result).toEqual({ type: "exact_email", candidateId: "c1", needsReview: false });
  });

  it("returns a weak phone-only match flagged for review when email differs", () => {
    const result = matchCandidate({ email: "new@example.com", phone: "919876543210" }, candidates);
    expect(result).toEqual({ type: "phone_weak", candidateId: "c1", needsReview: true });
  });

  it("prefers exact email match over a phone coincidence", () => {
    const result = matchCandidate({ email: "known@example.com", phone: "000" }, candidates);
    expect(result.type).toBe("exact_email");
  });

  it("returns none when nothing matches — a genuinely new candidate", () => {
    const result = matchCandidate({ email: "brandnew@example.com", phone: "111111111" }, candidates);
    expect(result).toEqual({ type: "none", candidateId: null, needsReview: false });
  });
});

describe("decideApplicationOutcome", () => {
  it("creates a new application when none exists for this candidate+job", () => {
    expect(decideApplicationOutcome(false)).toBe("create");
  });

  it("is an idempotent no-op when the application already exists (redelivered event)", () => {
    expect(decideApplicationOutcome(true)).toBe("noop");
  });
});
