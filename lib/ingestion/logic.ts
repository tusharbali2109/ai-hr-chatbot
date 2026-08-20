import type { ApplicationSource } from "@/lib/types/database";

/** Raw payload shape is platform-defined and never trusted structurally. */
export type RawApplicantPayload = Record<string, unknown>;

export interface NormalizedApplicant {
  name: string;
  email: string;
  phone: string | null;
  location: string | null;
  resume_url: string | null;
  linkedin_url: string | null;
  portfolio_url: string | null;
  source: ApplicationSource;
  source_platform: string;
}

function firstString(raw: RawApplicantPayload, keys: string[]): string | null {
  for (const key of keys) {
    const value = raw[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

/** Maps whatever the closest existing enum value is for a given platform slug. */
function sourceForPlatform(platform: string): ApplicationSource {
  const normalized = platform.toLowerCase();
  if (normalized === "linkedin") return "linkedin";
  if (normalized === "careers_site" || normalized === "manual") return "career_site";
  return "job_board";
}

/**
 * Normalizes a platform-specific applicant payload into one internal shape.
 * Different platforms use different field names for the same concept (e.g.
 * `first_name`/`last_name` vs `name`, `email` vs `email_address`, `phone` vs
 * `mobile`, `resume_url` vs `cv_url`) — this is the single place that
 * knowledge lives, so nothing downstream needs to know about raw shapes.
 */
export function normalizeIngestPayload(raw: RawApplicantPayload, platform: string): NormalizedApplicant {
  const firstName = firstString(raw, ["first_name"]);
  const lastName = firstString(raw, ["last_name"]);
  const combinedName = firstName || lastName ? [firstName, lastName].filter(Boolean).join(" ") : null;
  const name = firstString(raw, ["name", "full_name"]) ?? combinedName ?? "Unknown Candidate";

  const email = firstString(raw, ["email", "email_address"]) ?? "";
  const phone = firstString(raw, ["phone", "mobile", "phone_number"]);
  const location = firstString(raw, ["location", "city"]);
  const resume_url = firstString(raw, ["resume_url", "cv_url", "resumeUrl"]);
  const linkedin_url = firstString(raw, ["linkedin_url", "linkedinUrl"]);
  const portfolio_url = firstString(raw, ["portfolio_url", "portfolioUrl"]);

  return {
    name,
    email: normalizeEmail(email),
    phone: normalizePhone(phone),
    location,
    resume_url,
    linkedin_url,
    portfolio_url,
    source: sourceForPlatform(platform),
    source_platform: platform.toLowerCase(),
  };
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Strips formatting, keeps digits only. Returns null for empty/unusable input. */
export function normalizePhone(phone: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/[^\d]/g, "");
  return digits.length >= 7 ? digits : null;
}

export interface CandidateMatchCandidate {
  id: string;
  email: string;
  phone: string | null;
}

export type MatchType = "exact_email" | "phone_weak" | "none";

export interface MatchResult {
  type: MatchType;
  candidateId: string | null;
  /** true when the match should be flagged for manual review rather than
   * treated as a confident merge (e.g. a weak phone-only signal). */
  needsReview: boolean;
}

/**
 * Pure matching decision — the caller fetches candidate rows by normalized
 * email/phone, this function decides what the match means. No DB access, so
 * it's independently testable against the full matching-strategy matrix.
 */
export function matchCandidate(
  input: { email: string; phone: string | null },
  candidates: CandidateMatchCandidate[]
): MatchResult {
  const exactEmailMatch = candidates.find((c) => c.email === input.email);
  if (exactEmailMatch) {
    return { type: "exact_email", candidateId: exactEmailMatch.id, needsReview: false };
  }

  if (input.phone) {
    const phoneMatch = candidates.find((c) => c.phone === input.phone);
    if (phoneMatch) {
      return { type: "phone_weak", candidateId: phoneMatch.id, needsReview: true };
    }
  }

  return { type: "none", candidateId: null, needsReview: false };
}

/**
 * A redelivered webhook/sync event for an application that already exists
 * (unique(candidate_id, job_id)) must not error or duplicate — treat it as
 * an idempotent no-op rather than a rejection.
 */
export function decideApplicationOutcome(existingApplication: boolean): "create" | "noop" {
  return existingApplication ? "noop" : "create";
}
