import { describe, it, expect, vi } from "vitest";
import { processTurn, type TurnQuestion } from "@/lib/interview/conversation";
import type { AIProvider } from "@/lib/ai/provider";
import type { AnswerEvaluation, FollowUpDecision } from "@/lib/ai/schemas";

function sufficientEvaluation(): AnswerEvaluation {
  return { relevance_score: 90, technical_score: 85, clarity_score: 88, sufficiency: "SUFFICIENT", evaluation: "Clear, relevant answer." };
}

function insufficientEvaluation(): AnswerEvaluation {
  return { relevance_score: 40, technical_score: 30, clarity_score: 50, sufficiency: "INSUFFICIENT", evaluation: "Vague, off-topic answer." };
}

/** A fake AIProvider double — only evaluateAnswer/generateFollowUp are used
 * by processTurn, so only those need real implementations; no real
 * Anthropic call is made anywhere in this test file. */
function fakeAIProvider(overrides: {
  evaluateAnswer?: () => Promise<AnswerEvaluation>;
  generateFollowUp?: () => Promise<FollowUpDecision>;
} = {}): AIProvider {
  return {
    evaluateAnswer: overrides.evaluateAnswer ?? (async () => sufficientEvaluation()),
    generateFollowUp: overrides.generateFollowUp ?? (async () => ({ should_follow_up: false, follow_up_question: null, reason: "Sufficient." })),
  } as unknown as AIProvider;
}

const QUESTIONS: TurnQuestion[] = [
  { id: "q1", sequence: 1, question: "Tell me about your Python experience.", category: "Python" },
  { id: "q2", sequence: 2, question: "Tell me about your FastAPI experience.", category: "FastAPI" },
];

describe("processTurn", () => {
  it("asks the first question when no answer has been given yet", async () => {
    const decision = await processTurn(
      { jobTitle: "Backend Engineer", primaryQuestions: QUESTIONS, currentIndex: 0, followupCountForCurrent: 0, latestAnswerText: null },
      fakeAIProvider()
    );
    expect(decision).toEqual({ type: "ASK_QUESTION", question: QUESTIONS[0].question, sequence: 1 });
  });

  it("returns END_CALL immediately when no questions were planned", async () => {
    const decision = await processTurn(
      { jobTitle: "Backend Engineer", primaryQuestions: [], currentIndex: 0, followupCountForCurrent: 0, latestAnswerText: null },
      fakeAIProvider()
    );
    expect(decision.type).toBe("END_CALL");
  });

  it("advances to the next question after a sufficient answer", async () => {
    const decision = await processTurn(
      { jobTitle: "Backend Engineer", primaryQuestions: QUESTIONS, currentIndex: 0, followupCountForCurrent: 0, latestAnswerText: "I've used Python for 4 years." },
      fakeAIProvider({ evaluateAnswer: async () => sufficientEvaluation() })
    );
    expect(decision).toMatchObject({ type: "ASK_QUESTION", sequence: 2 });
  });

  it("asks a follow-up on an insufficient answer under the follow-up limit", async () => {
    const generateFollowUp = vi.fn(async () => ({ should_follow_up: true, follow_up_question: "Can you elaborate?", reason: "Vague." }));
    const decision = await processTurn(
      { jobTitle: "Backend Engineer", primaryQuestions: QUESTIONS, currentIndex: 0, followupCountForCurrent: 0, latestAnswerText: "Not sure." },
      fakeAIProvider({ evaluateAnswer: async () => insufficientEvaluation(), generateFollowUp })
    );
    expect(generateFollowUp).toHaveBeenCalledOnce();
    expect(decision).toEqual({ type: "ASK_FOLLOWUP", question: "Can you elaborate?", evaluation: insufficientEvaluation() });
  });

  it("does not ask a follow-up once the follow-up limit is exceeded — moves on instead", async () => {
    const generateFollowUp = vi.fn(async () => ({ should_follow_up: true, follow_up_question: "Can you elaborate?", reason: "Vague." }));
    const decision = await processTurn(
      { jobTitle: "Backend Engineer", primaryQuestions: QUESTIONS, currentIndex: 0, followupCountForCurrent: 2, latestAnswerText: "Not sure." },
      fakeAIProvider({ evaluateAnswer: async () => insufficientEvaluation(), generateFollowUp })
    );
    expect(generateFollowUp).not.toHaveBeenCalled();
    expect(decision).toMatchObject({ type: "ASK_QUESTION", sequence: 2 });
  });

  it("moves on when the AI decides not to follow up despite an insufficient answer", async () => {
    const decision = await processTurn(
      { jobTitle: "Backend Engineer", primaryQuestions: QUESTIONS, currentIndex: 0, followupCountForCurrent: 0, latestAnswerText: "I don't know." },
      fakeAIProvider({
        evaluateAnswer: async () => insufficientEvaluation(),
        generateFollowUp: async () => ({ should_follow_up: false, follow_up_question: null, reason: "Candidate doesn't know — move on respectfully." }),
      })
    );
    expect(decision).toMatchObject({ type: "ASK_QUESTION", sequence: 2 });
  });

  it("ends the call after the last question is answered", async () => {
    const decision = await processTurn(
      { jobTitle: "Backend Engineer", primaryQuestions: QUESTIONS, currentIndex: 1, followupCountForCurrent: 0, latestAnswerText: "I've used FastAPI for 2 years." },
      fakeAIProvider({ evaluateAnswer: async () => sufficientEvaluation() })
    );
    expect(decision.type).toBe("END_CALL");
    expect(decision).toHaveProperty("evaluation");
  });

  it("ends the call if the current index is out of range", async () => {
    const decision = await processTurn(
      { jobTitle: "Backend Engineer", primaryQuestions: QUESTIONS, currentIndex: 5, followupCountForCurrent: 0, latestAnswerText: "..." },
      fakeAIProvider()
    );
    expect(decision.type).toBe("END_CALL");
  });
});
