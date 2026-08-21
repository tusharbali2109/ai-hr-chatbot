"use server";

import { createClient } from "@/lib/supabase/server";
import { createWebhookClient } from "@/lib/supabase/webhook-client";
import {
  getInterview,
  getInterviewContext,
  listInterviewQuestions,
  createInterviewQuestion,
  createInterviewAnswer,
  updateInterview,
  logInterviewEvent,
  finalizeInterview,
} from "@/lib/services/interviews";
import { updateApplicationStage } from "@/lib/services/applications";
import { markAgentRunCompleted } from "@/lib/services/agent-runs";
import { logInternalEvent } from "@/lib/services/ingestion";
import { processTurn, type TurnQuestion } from "@/lib/interview/conversation";
import { getAIProvider } from "@/lib/ai";
import { MODEL } from "@/lib/ai/anthropic-provider";
import {
  computeWeightedInterviewScore,
  decideInterviewRecommendation,
  mapInterviewComponentScores,
  DEFAULT_INTERVIEW_RUBRIC_WEIGHTS,
} from "@/lib/interview/logic";
import type { InterviewAnswer, InterviewQuestion, Interview } from "@/lib/types/database";

/**
 * Candidate-facing driver for the browser video interview. Reuses the exact
 * same processTurn/evaluateInterview/finalizeInterview machinery the Twilio
 * webhook (app/api/webhooks/twilio/voice/route.ts) already uses — this file
 * is the browser-channel equivalent of that route, called once per turn from
 * the candidate's own browser instead of once per Twilio HTTP callback.
 *
 * Ownership checks and every write to candidate-RLS-covered tables
 * (interviews/interview_questions/interview_answers/interview_events, see
 * migration 0011) run under the candidate's own session. Only the final
 * application-stage transition and agent-run bookkeeping — recruiter-only
 * tables with no candidate RLS policy — switch to the service-role client,
 * same justified pattern as the assessment submit route.
 *
 * Score/recommendation/summary/strengths/gaps/concerns are never included
 * in any value returned from this file — the candidate must never see them,
 * only that the interview is complete.
 */

export interface CandidateInterviewTurn {
  status: "IN_PROGRESS" | "DONE" | "NOT_FOUND";
  question?: string;
  questionId?: string;
  candidateName?: string;
}

async function loadOwnedBrowserInterview(interviewId: string) {
  const candidateClient = await createClient();
  const interview = await getInterview(interviewId, candidateClient);
  if (!interview || interview.provider !== "browser") return null;
  return { interview, candidateClient };
}

function pendingQuestion(currentPrimary: InterviewQuestion, allQuestions: InterviewQuestion[]): InterviewQuestion {
  const followups = allQuestions
    .filter((q) => q.question_type === "FOLLOWUP" && q.parent_question_id === currentPrimary.id)
    .sort((a, b) => a.sequence - b.sequence);
  return followups.length > 0 ? followups[followups.length - 1] : currentPrimary;
}

/** Called once when the candidate opens the interview page — starts the
 * session on first load, or resumes exactly where they left off. */
export async function getCandidateInterviewTurnAction(interviewId: string): Promise<CandidateInterviewTurn> {
  const owned = await loadOwnedBrowserInterview(interviewId);
  if (!owned) return { status: "NOT_FOUND" };
  const { interview, candidateClient } = owned;

  if (interview.status === "COMPLETED" || interview.status === "NEEDS_REVIEW" || interview.status === "PROCTORING_TERMINATED") {
    return { status: "DONE" };
  }

  const allQuestions = await listInterviewQuestions(interviewId, candidateClient);
  const primaryQuestions = allQuestions.filter((q) => q.question_type === "PRIMARY").sort((a, b) => a.sequence - b.sequence);
  const currentPrimary = primaryQuestions[interview.current_question_index];

  if (interview.status === "QUEUED") {
    await updateInterview(interviewId, { status: "IN_PROGRESS", started_at: new Date().toISOString() }, candidateClient);
    await logInterviewEvent(interviewId, "CALL_STARTED", { channel: "browser" }, candidateClient);
  }

  if (!currentPrimary) {
    // No questions were planned — surface as done so the page can prompt
    // the candidate to finish; a NEEDS_REVIEW summary is written on finalize.
    return { status: "DONE" };
  }

  const pending = pendingQuestion(currentPrimary, allQuestions);
  return { status: "IN_PROGRESS", question: pending.question, questionId: pending.id };
}

/** Best-effort proctoring signal (tab switched away, camera/mic dropped) —
 * logged for the recruiter to see in the interview's event trail, never
 * shown back to the candidate as a score or verdict. Never throws: a
 * logging hiccup must not interrupt the interview itself. */
export async function logProctoringWarningAction(interviewId: string, reason: string): Promise<void> {
  try {
    const owned = await loadOwnedBrowserInterview(interviewId);
    if (!owned) return;
    await logInterviewEvent(interviewId, "PROCTORING_WARNING", { reason }, owned.candidateClient);
  } catch {
    // best-effort
  }
}

/** Auto-terminates the interview and rejects the application after the
 * candidate exceeds the proctoring warning limit (repeated tab-switching,
 * blocked paste attempts, camera/mic loss, or the face monitor's sustained
 * no-face/multiple-faces/looking-away signal) — VideoInterviewRunner calls
 * this once its client-side warning counter crosses the threshold, never
 * the recruiter. Idempotent: a second call after the interview is already
 * terminal is a no-op. Mirrors finalizeCandidateInterviewAction's
 * candidateClient-for-ownership / webhookClient-for-application-mutation
 * split — decision_source: "SYSTEM" (not "AI") makes clear in the audit
 * trail this was a deterministic proctoring rule, not a model judgment. */
export async function rejectInterviewForProctoringAction(interviewId: string, warningCount: number): Promise<void> {
  const owned = await loadOwnedBrowserInterview(interviewId);
  if (!owned) throw new Error("Interview not found.");
  const { interview, candidateClient } = owned;
  if (interview.status === "COMPLETED" || interview.status === "NEEDS_REVIEW" || interview.status === "PROCTORING_TERMINATED") {
    return;
  }

  await logInterviewEvent(interviewId, "PROCTORING_REJECTED", { warning_count: warningCount }, candidateClient);

  const webhookClient = createWebhookClient();
  const finalized = await finalizeInterview(
    interviewId,
    {
      status: "PROCTORING_TERMINATED",
      overallScore: null,
      recommendation: "REJECTED",
      confidence: null,
      summary: "Interview automatically ended after repeated proctoring violations (tab-switching, blocked paste, camera/microphone loss, or the candidate not staying visible/facing the camera) during the AI video interview.",
      strengths: [],
      gaps: [],
      concerns: [],
      componentScores: {},
      scoringWeights: {},
      modelName: null,
      modelVersion: null,
      endedAt: new Date().toISOString(),
      durationSeconds: null,
    },
    webhookClient
  );

  await updateApplicationStage(
    finalized.application_id,
    "AI_INTERVIEW",
    "REJECTED",
    "AI video interview automatically terminated: exceeded the proctoring warning limit.",
    { source: "interview", decision_source: "SYSTEM", interview_id: finalized.id },
    webhookClient
  );

  await logInternalEvent(
    "candidate.interview.completed",
    {
      application_id: finalized.application_id,
      payload: { recommendation: "REJECTED", overall_score: null, status: "PROCTORING_TERMINATED" },
    },
    webhookClient
  );
}

export interface SubmitAnswerResult {
  done: boolean;
  question?: string;
  questionId?: string;
}

/** One turn: persist the candidate's transcribed answer, run the same
 * evaluation/follow-up decision the phone interview uses, and return
 * whatever comes next. */
export async function submitCandidateInterviewAnswerAction(interviewId: string, questionId: string, answerText: string): Promise<SubmitAnswerResult> {
  if (!answerText.trim()) throw new Error("No answer was captured — please try again.");

  const owned = await loadOwnedBrowserInterview(interviewId);
  if (!owned) throw new Error("Interview not found.");
  const { interview, candidateClient } = owned;

  const webhookClient = createWebhookClient();
  const context = await getInterviewContext(interviewId, webhookClient);
  if (!context || !context.screeningCriteria) throw new Error("This interview is missing its job context.");

  const allQuestions = await listInterviewQuestions(interviewId, candidateClient);
  const primaryQuestions = allQuestions.filter((q) => q.question_type === "PRIMARY").sort((a, b) => a.sequence - b.sequence);
  const turnQuestions: TurnQuestion[] = primaryQuestions.map((q) => ({ id: q.id, sequence: q.sequence, question: q.question, category: q.category }));

  const currentIndex = interview.current_question_index;
  const currentPrimary = primaryQuestions[currentIndex];
  if (!currentPrimary) throw new Error("No question is currently pending for this interview.");

  const answeredQuestion = pendingQuestion(currentPrimary, allQuestions);
  if (answeredQuestion.id !== questionId) {
    throw new Error("That question is no longer current — reloading the page will show the right one.");
  }

  const followupsForCurrent = allQuestions.filter((q) => q.question_type === "FOLLOWUP" && q.parent_question_id === currentPrimary.id);

  const decision = await processTurn(
    {
      jobTitle: context.jobTitle,
      primaryQuestions: turnQuestions,
      currentIndex,
      followupCountForCurrent: followupsForCurrent.length,
      latestAnswerText: answerText,
    },
    getAIProvider()
  );

  if (decision.evaluation) {
    await createInterviewAnswer(
      {
        interviewId,
        questionId: answeredQuestion.id,
        transcript: answerText,
        durationSeconds: null,
        relevanceScore: decision.evaluation.relevance_score,
        technicalScore: decision.evaluation.technical_score,
        clarityScore: decision.evaluation.clarity_score,
        evidenceQuality: null,
        sufficiency: decision.evaluation.sufficiency,
        evaluation: decision.evaluation.evaluation,
      },
      candidateClient
    );
    await logInterviewEvent(interviewId, "ANSWER_RECEIVED", { question_id: answeredQuestion.id, sufficiency: decision.evaluation.sufficiency }, candidateClient);
  }

  if (decision.type === "END_CALL") {
    await logInterviewEvent(interviewId, "CALL_ENDED", { reason: decision.reason }, candidateClient);
    return { done: true };
  }

  if (decision.type === "ASK_FOLLOWUP") {
    const nextSequence = Math.max(...allQuestions.map((q) => q.sequence)) + 1000;
    const followup = await createInterviewQuestion(
      {
        interviewId,
        sequence: nextSequence,
        section: currentPrimary.section,
        category: currentPrimary.category,
        question: decision.question,
        questionType: "FOLLOWUP",
        parentQuestionId: currentPrimary.id,
      },
      candidateClient
    );
    await logInterviewEvent(interviewId, "FOLLOWUP_GENERATED", { question: decision.question }, candidateClient);
    return { done: false, question: decision.question, questionId: followup.id };
  }

  // ASK_QUESTION -> advance to the next primary question.
  await updateInterview(interviewId, { current_question_index: currentIndex + 1 }, candidateClient);
  await logInterviewEvent(interviewId, "QUESTION_ASKED", { question: decision.question }, candidateClient);
  const nextPrimary = primaryQuestions[currentIndex + 1];
  return { done: false, question: decision.question, questionId: nextPrimary?.id };
}

function buildTranscript(questions: InterviewQuestion[], answers: InterviewAnswer[]): { speaker: "AI" | "CANDIDATE"; text: string }[] {
  const answersByQuestion = new Map(answers.map((a) => [a.question_id, a]));
  return [...questions]
    .sort((a, b) => a.sequence - b.sequence)
    .flatMap((q) => {
      const turns: { speaker: "AI" | "CANDIDATE"; text: string }[] = [{ speaker: "AI", text: q.question }];
      const answer = answersByQuestion.get(q.id);
      if (answer) turns.push({ speaker: "CANDIDATE", text: answer.transcript });
      return turns;
    });
}

/** Candidate clicks "End Interview" once every question is covered — scores
 * the whole transcript and moves the application forward, exactly like
 * finalizeCompletedInterview in the Twilio voice route, combined with the
 * status webhook's stage transition (there's no separate "call ended"
 * signal here — the candidate's own click is both). */
export async function finalizeCandidateInterviewAction(interviewId: string): Promise<void> {
  const owned = await loadOwnedBrowserInterview(interviewId);
  if (!owned) throw new Error("Interview not found.");
  const { interview, candidateClient } = owned;
  if (interview.status === "COMPLETED" || interview.status === "NEEDS_REVIEW") return;

  const webhookClient = createWebhookClient();
  const context = await getInterviewContext(interviewId, webhookClient);
  if (!context) throw new Error("This interview is missing its job context.");

  const allQuestions = await listInterviewQuestions(interviewId, candidateClient);
  const { data: answerRows, error } = await candidateClient
    .from("interview_answers")
    .select("*")
    .in(
      "question_id",
      allQuestions.map((q) => q.id)
    );
  if (error) throw error;
  const answers = (answerRows ?? []) as InterviewAnswer[];
  const transcript = buildTranscript(allQuestions, answers);

  let finalized: Interview;
  if (!context.screeningCriteria || allQuestions.length === 0) {
    finalized = await finalizeInterview(
      interviewId,
      {
        status: "NEEDS_REVIEW",
        overallScore: null,
        recommendation: "NEEDS_REVIEW",
        confidence: null,
        summary: "No interview questions were planned — needs recruiter review.",
        strengths: [],
        gaps: [],
        concerns: [],
        componentScores: {},
        scoringWeights: {},
        modelName: null,
        modelVersion: null,
        endedAt: new Date().toISOString(),
        durationSeconds: null,
      },
      webhookClient
    );
  } else {
    const evaluation = await getAIProvider().evaluateInterview({
      jobTitle: context.jobTitle,
      jobDescription: context.jobDescription,
      screeningCriteria: context.screeningCriteria,
      transcript,
    });

    const componentScores = mapInterviewComponentScores(evaluation.component_scores);
    const score = computeWeightedInterviewScore(componentScores);
    const primaryCount = allQuestions.filter((q) => q.question_type === "PRIMARY").length;
    const { recommendation } = decideInterviewRecommendation(score, {
      questionsAsked: interview.current_question_index + 1,
      plannedQuestions: primaryCount,
    });

    finalized = await finalizeInterview(
      interviewId,
      {
        status: "COMPLETED",
        overallScore: score,
        recommendation,
        confidence: evaluation.confidence,
        summary: evaluation.summary,
        strengths: evaluation.strengths,
        gaps: evaluation.gaps,
        concerns: evaluation.concerns,
        componentScores,
        scoringWeights: DEFAULT_INTERVIEW_RUBRIC_WEIGHTS,
        modelName: "anthropic",
        modelVersion: MODEL,
        endedAt: new Date().toISOString(),
        durationSeconds: null,
      },
      webhookClient
    );
  }

  await logInterviewEvent(interviewId, "EVALUATION_COMPLETED", { recommendation: finalized.recommendation, overall_score: finalized.overall_score }, webhookClient);

  if (finalized.agent_run_id) {
    await markAgentRunCompleted(
      finalized.agent_run_id,
      { interview_id: finalized.id, recommendation: finalized.recommendation, overall_score: finalized.overall_score },
      webhookClient
    );
  }

  const targetStage = finalized.recommendation === "INTERVIEW_SHORTLISTED" ? "INTERVIEW_SHORTLISTED" : finalized.recommendation === "REJECTED" ? "REJECTED" : "NEEDS_REVIEW";
  await updateApplicationStage(
    finalized.application_id,
    "AI_INTERVIEW",
    targetStage,
    `AI video interview ${finalized.status.toLowerCase().replace("_", " ")}`,
    { source: "interview", decision_source: "AI", interview_id: finalized.id },
    webhookClient
  );

  await logInternalEvent(
    "candidate.interview.completed",
    {
      application_id: finalized.application_id,
      payload: { recommendation: finalized.recommendation, overall_score: finalized.overall_score, status: finalized.status },
    },
    webhookClient
  );
}
