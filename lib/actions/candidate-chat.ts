"use server";

import { getAuthedCompanyId, assertJobOwnership } from "@/lib/services/jd";
import { getApplication, listStageHistory } from "@/lib/services/applications";
import { getCandidate } from "@/lib/services/candidates";
import { getJob } from "@/lib/services/jobs";
import { getLatestScreening } from "@/lib/services/screening";
import { getLatestInterview } from "@/lib/services/interviews";
import { getLatestAssessmentForJob, getLatestAssignmentForApplication, listQuestionEvaluations, listAssessmentQuestions } from "@/lib/services/assessments";
import { getAIProvider } from "@/lib/ai";
import type { ExplainCandidateChatTurn, ExplainCandidateInput } from "@/lib/ai/provider";

const MAX_QUESTION_LENGTH = 2000;
const MAX_PRIOR_TURNS = 20;

/**
 * "Explain this candidate" chat — answers a recruiter's plain-language
 * question using ONLY the data already available for this application
 * (screening, interview, assessment, stage history), the same data the
 * candidate detail page itself renders. Ephemeral: nothing is persisted,
 * the chat history lives in client React state and is passed back in on
 * every call purely so follow-up questions have context.
 */
export async function askAboutCandidateAction(
  applicationId: string,
  question: string,
  priorTurns: ExplainCandidateChatTurn[]
): Promise<string> {
  const trimmedQuestion = question.trim();
  if (!trimmedQuestion) throw new Error("A question is required.");
  if (trimmedQuestion.length > MAX_QUESTION_LENGTH) throw new Error("Question is too long.");

  const { companyId } = await getAuthedCompanyId();

  const application = await getApplication(applicationId);
  if (!application) throw new Error("Application not found.");
  await assertJobOwnership(application.job_id, companyId);

  const [candidate, job, screening, interview, jobAssessment, assessmentAssignment, stageHistory] = await Promise.all([
    getCandidate(application.candidate_id),
    getJob(application.job_id),
    getLatestScreening(applicationId),
    getLatestInterview(applicationId),
    getLatestAssessmentForJob(application.job_id),
    getLatestAssignmentForApplication(applicationId),
    listStageHistory(applicationId),
  ]);

  if (!candidate || !job) throw new Error("Candidate or job not found.");

  let assessmentSection: ExplainCandidateInput["assessment"] = null;
  if (assessmentAssignment) {
    const [questionEvals, questions] = await Promise.all([
      listQuestionEvaluations(assessmentAssignment.id),
      jobAssessment ? listAssessmentQuestions(jobAssessment.id) : Promise.resolve([]),
    ]);
    const questionById = new Map(questions.map((q) => [q.id, q]));
    assessmentSection = {
      assessmentTitle: jobAssessment?.title ?? null,
      status: assessmentAssignment.status,
      score: assessmentAssignment.score,
      passingScore: jobAssessment?.passing_score ?? null,
      recommendation: assessmentAssignment.recommendation,
      questionEvaluations: questionEvals.map((e) => ({
        question: questionById.get(e.question_id)?.question ?? "Unknown question",
        score: e.score,
        maxScore: e.max_score,
        evaluation: e.evaluation,
      })),
    };
  }

  const answersByQuestion = new Map(interview?.answers.map((a) => [a.question_id, a]) ?? []);

  const input: ExplainCandidateInput = {
    candidateName: candidate.name,
    jobTitle: job.title,
    currentStage: application.current_stage,
    screening: screening
      ? {
          recommendation: screening.recommendation,
          overallScore: screening.overall_score,
          summary: screening.summary,
          strengths: screening.strengths,
          gaps: screening.gaps,
          concerns: screening.concerns,
          requirements: screening.requirements.map((r) => ({
            type: r.requirement_type,
            requirement: r.requirement,
            status: r.status,
            evidence: r.evidence,
          })),
        }
      : null,
    interview: interview
      ? {
          status: interview.status,
          recommendation: interview.recommendation,
          overallScore: interview.overall_score,
          summary: interview.summary,
          strengths: interview.strengths,
          gaps: interview.gaps,
          concerns: interview.concerns,
          transcript: [...interview.questions]
            .sort((a, b) => a.sequence - b.sequence)
            .map((q) => {
              const answer = answersByQuestion.get(q.id);
              return {
                question: q.question,
                answer: answer?.transcript ?? "No answer recorded.",
                sufficiency: answer?.sufficiency ?? null,
                evaluation: answer?.evaluation ?? null,
              };
            }),
        }
      : null,
    assessment: assessmentSection,
    stageHistory: stageHistory.map((h) => ({ toStage: h.to_stage, reason: h.reason, createdAt: h.created_at })),
    question: trimmedQuestion,
    priorTurns: priorTurns.slice(-MAX_PRIOR_TURNS),
  };

  return getAIProvider().explainCandidate(input);
}
