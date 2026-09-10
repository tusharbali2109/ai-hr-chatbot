import { getAIProvider } from "@/lib/ai";
import { fetchCandidateResumeText } from "@/lib/files/resume-text";
import { UserFacingError } from "@/lib/action-result";
import { buildInterviewPlanSections, DEFAULT_INTERVIEW_CONFIG } from "./logic";
import type { ScreeningCriteria } from "@/lib/ai/schemas";

/** Finish all AI work before creating an interview or changing its stage.
 *
 * Sections are generated in parallel (each is a distinct skill/category, so
 * cross-section repetition isn't really a risk); questions WITHIN a section
 * stay sequential so the second one can avoid repeating the first. This
 * keeps prep to roughly one round-trip instead of ~15 serial AI calls,
 * which matters a lot when every call is paying the Anthropic->Gemini
 * fallback tax. */
export async function prepareInterviewQuestions(jobTitle: string, criteria: ScreeningCriteria, resumeUrl: string | null) {
  const resumeText = await fetchCandidateResumeText(resumeUrl);
  if (!resumeText?.trim()) throw new UserFacingError("A readable resume is required. Upload a text-based PDF, DOCX, or TXT resume and retry.");

  const sections = buildInterviewPlanSections(
    criteria.mandatory.map((m) => m.skill),
    criteria.preferred.map((p) => p.skill),
    DEFAULT_INTERVIEW_CONFIG.maxDurationMinutes
  );

  const perSection = await Promise.all(
    sections
      .filter((section) => section.targetQuestions > 0)
      .map(async (section) => {
        const out: { section: string; category: string | null; question: string }[] = [];
        const priorTurns: { question: string; answer: string }[] = [];
        for (let i = 0; i < section.targetQuestions; i++) {
          const generated = await getAIProvider().generateQuestion({
            jobTitle,
            section: section.name,
            category: section.category ?? null,
            resumeText,
            priorTurns: [...priorTurns],
          });
          out.push({ section: section.name, category: section.category ?? generated.category, question: generated.question });
          priorTurns.push({ question: generated.question, answer: "Not asked yet. Avoid repeating this planned question." });
        }
        return out;
      })
  );

  const questions = perSection.flat();
  if (!questions.length) throw new UserFacingError("No interview questions could be prepared. Check the job screening criteria.");
  return questions;
}
