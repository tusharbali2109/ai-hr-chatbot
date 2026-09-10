import { getAIProvider } from "@/lib/ai";
import { fetchCandidateResumeText } from "@/lib/files/resume-text";
import { UserFacingError } from "@/lib/action-result";
import { buildInterviewPlanSections, DEFAULT_INTERVIEW_CONFIG } from "./logic";
import type { ScreeningCriteria } from "@/lib/ai/schemas";

/** Finish all AI work before creating an interview or changing its stage. */
export async function prepareInterviewQuestions(jobTitle: string, criteria: ScreeningCriteria, resumeUrl: string | null) {
  const resumeText = await fetchCandidateResumeText(resumeUrl);
  if (!resumeText?.trim()) throw new UserFacingError("A readable resume is required. Upload a text-based PDF, DOCX, or TXT resume and retry.");
  const sections = buildInterviewPlanSections(criteria.mandatory.map(m => m.skill), criteria.preferred.map(p => p.skill), DEFAULT_INTERVIEW_CONFIG.maxDurationMinutes);
  const priorTurns: { question: string; answer: string }[] = [];
  const questions = [];
  for (const section of sections) {
    for (let i = 0; i < section.targetQuestions; i++) {
      const generated = await getAIProvider().generateQuestion({ jobTitle, section: section.name, category: section.category ?? null, resumeText, priorTurns: [...priorTurns] });
      questions.push({ section: section.name, category: section.category ?? generated.category, question: generated.question });
      priorTurns.push({ question: generated.question, answer: "Not asked yet. Avoid repeating this planned question." });
    }
  }
  if (!questions.length) throw new UserFacingError("No interview questions could be prepared. Check the job screening criteria.");
  return questions;
}
