import { AIServiceError } from "@/lib/ai/errors";
import type { AIProvider } from "@/lib/ai/provider";

/**
 * Wraps a primary and a secondary AIProvider: every call goes to the
 * primary first, and only if the primary raises an AIServiceError — the
 * curated error every billing / auth / rate-limit / outage / unreadable-
 * response failure normalizes to — is the identical call retried on the
 * secondary. Anything else (a programming error, a model refusal) is not a
 * "the provider couldn't do it" signal and propagates untouched.
 *
 * If the secondary ALSO fails, the secondary's error is what surfaces (with
 * a note that the primary failed too) — once Anthropic is down, "the Gemini
 * fallback isn't configured / its key was rejected / it's rate-limited" is
 * the message an operator can actually act on, not "Anthropic is out of
 * credits" again. Both failures are logged.
 *
 * Used to keep the product working when the Anthropic account runs out of
 * credits: Anthropic stays first priority, Gemini silently covers the gap.
 */
export function createFallbackProvider(primary: AIProvider, secondary: AIProvider): AIProvider {
  const wrap = <K extends keyof AIProvider>(key: K): AIProvider[K] => {
    const run = async (...args: unknown[]): Promise<unknown> => {
      try {
        return await (primary[key] as (...a: unknown[]) => Promise<unknown>)(...args);
      } catch (primaryErr) {
        if (!(primaryErr instanceof AIServiceError)) throw primaryErr;
        console.warn(`[ai] primary provider failed for ${String(key)}() — trying fallback. Reason: ${primaryErr.message}`);
        try {
          return await (secondary[key] as (...a: unknown[]) => Promise<unknown>)(...args);
        } catch (secondaryErr) {
          console.error(`[ai] fallback provider also failed for ${String(key)}():`, secondaryErr);
          if (secondaryErr instanceof AIServiceError) {
            throw new AIServiceError(`${secondaryErr.message} (Primary AI provider also failed: ${primaryErr.message})`);
          }
          throw primaryErr;
        }
      }
    };
    return run as AIProvider[K];
  };

  return {
    generateStructuredRequirement: wrap("generateStructuredRequirement"),
    generateJD: wrap("generateJD"),
    improveJD: wrap("improveJD"),
    evaluateCandidate: wrap("evaluateCandidate"),
    generateInterviewPlan: wrap("generateInterviewPlan"),
    generateQuestion: wrap("generateQuestion"),
    evaluateAnswer: wrap("evaluateAnswer"),
    generateFollowUp: wrap("generateFollowUp"),
    evaluateInterview: wrap("evaluateInterview"),
    generateAssessment: wrap("generateAssessment"),
    improveAssessment: wrap("improveAssessment"),
    evaluateAssessmentAnswer: wrap("evaluateAssessmentAnswer"),
    reviewOpenEndedSubmission: wrap("reviewOpenEndedSubmission"),
    evaluateWorkdayTask: wrap("evaluateWorkdayTask"),
    extractCandidateFromResume: wrap("extractCandidateFromResume"),
    explainCandidate: wrap("explainCandidate"),
  };
}
