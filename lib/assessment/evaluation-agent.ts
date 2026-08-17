import type { SupabaseClient } from "@supabase/supabase-js";
import { getJob } from "@/lib/services/jobs";
import { getApplication, updateApplicationStage } from "@/lib/services/applications";
import { hasActiveRun, createAgentRun, markAgentRunRunning, markAgentRunCompleted, markAgentRunFailed } from "@/lib/services/agent-runs";
import { logInternalEvent } from "@/lib/services/ingestion";
import {
  getAssignment,
  getAssessment,
  listAssessmentQuestions,
  listAnswersForAssignment,
  createQuestionEvaluation,
  updateAssignmentStatus,
  logAssessmentEvent,
} from "@/lib/services/assessments";
import { getAIProvider } from "@/lib/ai";
import { computeFinalScore, decideRecommendation, mapAssessmentRecommendationToStage } from "@/lib/assessment/logic";
import type { AssessmentQuestion, AssessmentAnswer, EvaluationConfidence } from "@/lib/types/database";

export interface EvaluateSubmissionResult {
  status: "COMPLETED" | "FAILED";
  assignmentId: string;
  score?: number;
  recommendation?: string;
  error?: string;
}

function answerToText(question: AssessmentQuestion, answer: AssessmentAnswer | undefined): string {
  if (!answer) return "";
  if (question.type === "MCQ") return answer.selected_option ?? "";
  if (question.type === "CODING") return answer.code ?? "";
  if (question.type === "FILE_UPLOAD") return answer.file_url ? `[submitted file: ${answer.file_url}]` : "";
  return answer.answer_text ?? "";
}

/**
 * Orchestrates evaluation of one submitted assessment. Evaluates
 * question-by-question (spec §13/§16) — never asks the AI to blindly
 * produce a whole-assessment score. MCQ questions are graded
 * deterministically (exact match against expected_answer) rather than
 * spending an AI call on an objectively checkable answer. The final score
 * and SHORTLIST/REJECT/NEEDS_REVIEW recommendation are computed
 * deterministically in lib/assessment/logic.ts from the per-question
 * results, exactly like screening/interview.
 *
 * This runs from the candidate-facing submit route, not a recruiter
 * session, so it needs write access to recruiter-only tables (agent_runs,
 * applications, assessment_question_evaluations) that have no candidate RLS
 * policy by design — the caller MUST pass the service-role client (see
 * lib/supabase/webhook-client.ts), exactly like the Twilio webhook route
 * does for lib/interview/agent.ts's finalization path.
 */
export async function evaluateAssessmentSubmission(assignmentId: string, client: SupabaseClient): Promise<EvaluateSubmissionResult> {
  const assignment = await getAssignment(assignmentId, client);
  if (!assignment) throw new Error("Assignment not found.");

  const application = await getApplication(assignment.application_id, client);
  if (!application) throw new Error("Application not found.");

  if (await hasActiveRun("ASSESSMENT_EVALUATION", assignment.application_id, client)) {
    throw new Error("An evaluation is already in progress for this assignment.");
  }

  const [job, assessment, questions, answers] = await Promise.all([
    getJob(application.job_id, client),
    getAssessment(assignment.assessment_id, client),
    listAssessmentQuestions(assignment.assessment_id, client),
    listAnswersForAssignment(assignmentId, client),
  ]);
  if (!job) throw new Error("Job not found.");
  if (!assessment) throw new Error("Assessment not found.");

  const answersByQuestionId = new Map(answers.map((a) => [a.question_id, a]));

  const agentRun = await createAgentRun("ASSESSMENT_EVALUATION", assignment.application_id, client);
  await markAgentRunRunning(agentRun.id, "anthropic", client);
  await updateAssignmentStatus(assignmentId, { status: "EVALUATING" }, client);

  try {
    const confidences: EvaluationConfidence[] = [];
    const evaluations: { score: number; max_score: number }[] = [];

    for (const question of questions.sort((a, b) => a.sequence - b.sequence)) {
      const answer = answersByQuestionId.get(question.id);
      const candidateAnswerText = answerToText(question, answer);

      let score: number;
      let maxScore = question.points;
      let evaluationText: string;
      let evidence: string | null;
      let confidence: EvaluationConfidence;

      if (question.type === "MCQ") {
        const correct = question.expected_answer != null && candidateAnswerText.trim() === question.expected_answer.trim();
        score = correct ? question.points : 0;
        evaluationText = correct ? "Selected option matches the expected answer." : "Selected option does not match the expected answer.";
        evidence = candidateAnswerText || "(no option selected)";
        confidence = "HIGH";
      } else {
        const result = await getAIProvider().evaluateAssessmentAnswer({
          jobTitle: job.title,
          questionType: question.type,
          question: question.question,
          instructions: question.instructions,
          points: question.points,
          expectedAnswer: question.expected_answer,
          evaluationCriteria: question.evaluation_criteria ?? "Assess correctness, completeness, and relevance to the question.",
          candidateAnswer: candidateAnswerText,
        });
        score = Math.max(0, Math.min(result.score, question.points));
        maxScore = question.points;
        evaluationText = result.evaluation;
        evidence = result.evidence;
        confidence = result.confidence;
      }

      await createQuestionEvaluation(
        {
          assignmentId,
          questionId: question.id,
          score,
          maxScore,
          evaluation: evaluationText,
          evidence,
          confidence,
        },
        client
      );

      confidences.push(confidence);
      evaluations.push({ score, max_score: maxScore });
    }

    const score = computeFinalScore(evaluations);
    const { recommendation, reason } = decideRecommendation(score, assessment.passing_score, confidences);

    await updateAssignmentStatus(assignmentId, { status: "COMPLETED", score, recommendation }, client);

    const finalStage = mapAssessmentRecommendationToStage(recommendation);
    await updateApplicationStage(
      assignment.application_id,
      application.current_stage,
      finalStage,
      reason,
      { source: "assessment", decision_source: "AI", assignment_id: assignmentId },
      client
    );

    await markAgentRunCompleted(agentRun.id, { assignment_id: assignmentId, score, recommendation }, client);
    await logAssessmentEvent(assignmentId, "EVALUATION_COMPLETED", { score, recommendation }, client);

    await logInternalEvent(
      "assessment.evaluated",
      {
        application_id: assignment.application_id,
        candidate_id: assignment.candidate_id,
        job_id: application.job_id,
        payload: { assignment_id: assignmentId, score, recommendation },
      },
      client
    );

    return { status: "COMPLETED", assignmentId, score, recommendation };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Assessment evaluation failed for an unknown reason.";
    // Never silently becomes REJECTED — the assignment stays at EVALUATING
    // (already set above) for a human to retry or review, exactly like the
    // screening/interview agents' failure handling.
    await markAgentRunFailed(agentRun.id, message, client);
    return { status: "FAILED", assignmentId, error: message };
  }
}
