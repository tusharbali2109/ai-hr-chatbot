import type { AIProvider } from "@/lib/ai/provider";
import type { AnswerEvaluation } from "@/lib/ai/schemas";
import { isAnswerSufficient, hasExceededFollowupLimit } from "@/lib/interview/logic";

export interface TurnQuestion {
  id: string;
  sequence: number;
  question: string;
  category: string | null;
}

export interface TurnContext {
  jobTitle: string;
  /** The full planned primary-question list, in order, persisted upfront by
   * the agent before the call starts. */
  primaryQuestions: TurnQuestion[];
  /** Index into primaryQuestions of the question that latestAnswerText is
   * answering. Ignored when latestAnswerText is null (very first turn). */
  currentIndex: number;
  followupCountForCurrent: number;
  latestAnswerText: string | null;
}

export type TurnDecision =
  | { type: "ASK_QUESTION"; question: string; sequence: number; evaluation?: AnswerEvaluation }
  | { type: "ASK_FOLLOWUP"; question: string; evaluation: AnswerEvaluation }
  | { type: "END_CALL"; reason: string; evaluation?: AnswerEvaluation };

/**
 * The single "what happens on this turn" decision function — called both
 * by the real Twilio webhook route (once per real HTTP request) and by
 * MockVoiceProvider (in a synchronous in-process loop). This is the one
 * piece of conversational logic that must never be duplicated between the
 * mock and real paths.
 *
 * Pure aside from the injected AIProvider call — no DB access here. The
 * caller (agent/webhook route) is responsible for persisting questions,
 * answers, and events; this function only decides what happens next.
 */
export async function processTurn(ctx: TurnContext, aiProvider: AIProvider): Promise<TurnDecision> {
  const { primaryQuestions, currentIndex, latestAnswerText, followupCountForCurrent, jobTitle } = ctx;

  if (latestAnswerText === null) {
    const first = primaryQuestions[0];
    if (!first) return { type: "END_CALL", reason: "No questions were planned for this interview." };
    return { type: "ASK_QUESTION", question: first.question, sequence: first.sequence };
  }

  const current = primaryQuestions[currentIndex];
  if (!current) {
    return { type: "END_CALL", reason: "Interview plan already exhausted." };
  }

  const evaluation = await aiProvider.evaluateAnswer({
    jobTitle,
    category: current.category,
    question: current.question,
    answerTranscript: latestAnswerText,
  });

  if (!isAnswerSufficient(evaluation.sufficiency) && !hasExceededFollowupLimit(followupCountForCurrent)) {
    const followUp = await aiProvider.generateFollowUp({
      jobTitle,
      question: current.question,
      answerTranscript: latestAnswerText,
      evaluation,
      followupCount: followupCountForCurrent,
    });
    if (followUp.should_follow_up && followUp.follow_up_question) {
      return { type: "ASK_FOLLOWUP", question: followUp.follow_up_question, evaluation };
    }
  }

  const next = primaryQuestions[currentIndex + 1];
  if (!next) {
    return { type: "END_CALL", reason: "All planned questions have been covered.", evaluation };
  }
  return { type: "ASK_QUESTION", question: next.question, sequence: next.sequence, evaluation };
}
