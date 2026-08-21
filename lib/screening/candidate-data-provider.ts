import type { Candidate } from "@/lib/types/database";

export interface CandidateProfile {
  text: string;
  hasResume: boolean;
}

/**
 * CandidateDataProvider — builds the profile text handed to the AI
 * evaluator from whatever candidate data actually exists today. resumeText
 * is extracted separately (lib/files/resume-text.ts::fetchCandidateResumeText,
 * best-effort — undefined on any download/parse failure or for an external
 * job-board URL with no file to download) and passed in by the caller,
 * keeping this function itself a thin, storage-agnostic seam.
 *
 * Never invents data — fields that are absent are simply omitted, not
 * guessed at. If no information exists, the AI evaluator will correctly
 * see very little to go on and should return UNKNOWN for most
 * requirements, which is the honest outcome per the screening spec's
 * "if unavailable, UNKNOWN — never assume absence means failure" rule.
 */
export function buildCandidateProfile(candidate: Candidate, resumeText?: string): CandidateProfile {
  const lines: string[] = [];
  if (candidate.location) lines.push(`Location: ${candidate.location}`);
  if (resumeText) {
    lines.push(`Resume content:\n"""\n${resumeText}\n"""`);
  } else if (candidate.resume_url) {
    lines.push(
      `Resume on file (link only — full text could not be extracted, do not assume any content beyond what is listed here): ${candidate.resume_url}`
    );
  }
  if (candidate.linkedin_url) lines.push(`LinkedIn: ${candidate.linkedin_url}`);
  if (candidate.portfolio_url) lines.push(`Portfolio: ${candidate.portfolio_url}`);

  return {
    text: lines.length > 0 ? lines.join("\n") : "No structured candidate profile information is available beyond name and email.",
    hasResume: Boolean(candidate.resume_url),
  };
}
