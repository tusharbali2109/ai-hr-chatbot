import { getAIProvider } from "@/lib/ai";
import { processTurn, type TurnQuestion } from "@/lib/interview/conversation";
import { computeWeightedInterviewScore, decideInterviewRecommendation, mapInterviewComponentScores } from "@/lib/interview/logic";
import {
  listInterviewQuestions,
  createInterviewQuestion,
  createInterviewAnswer,
  logInterviewEvent,
  updateInterview,
  finalizeInterview,
} from "@/lib/services/interviews";
import type {
  VoiceProvider,
  VoiceProviderCapabilities,
  CreateCallInput,
  CreateCallResult,
  CallStatusResult,
  VoiceTranscriptTurn,
} from "@/lib/interview/voice-provider";
import { MODEL } from "@/lib/ai/anthropic-provider";
import type { InterviewQuestion } from "@/lib/types/database";

const CANNED_ANSWERS: Record<string, string> = {
  Introduction:
    "I've spent the last several years working as a backend engineer, mostly building and maintaining production APIs and services for growing product teams.",
  Experience:
    "Most recently I led the backend for a mid-sized product, owning the API layer end to end, from design through deployment and on-call support.",
};

function cannedAnswerFor(category: string | null): string {
  if (category && CANNED_ANSWERS[category]) return CANNED_ANSWERS[category];
  if (category) {
    return `I've worked with ${category} in production for a few years — most recently I used it to build and scale a service that handled real user traffic, and I ran into and resolved a few interesting performance issues along the way.`;
  }
  return "Sure — happy to answer that. Let me walk you through my thinking on that.";
}

/**
 * DEVELOPMENT / MOCK voice provider — simulates the entire call lifecycle
 * in-process, with no real telephony. Every user-facing string is prefixed
 * [MOCK] / mock-call-*.local so it can never be mistaken for a real call.
 *
 * Unlike the mock job-board connector, this provider still calls the REAL
 * configured AI provider (getAIProvider()) for question evaluation,
 * follow-up decisions, and the final interview evaluation — only the
 * TELEPHONY is faked here, not the AI. Running this in a live app still
 * requires ANTHROPIC_API_KEY to be configured, same as every other AI
 * feature in this app.
 *
 * To add a real provider (e.g. Twilio): implement VoiceProvider in a new
 * file under lib/interview/voice-providers/ and register it in
 * lib/interview/registry.ts. Nothing else needs to change.
 */
class MockVoiceProvider implements VoiceProvider {
  readonly name = "mock";

  readonly capabilities: VoiceProviderCapabilities = {
    supportsRecording: false,
    requiresPublicWebhook: false,
  };

  async createOutboundCall(input: CreateCallInput): Promise<CreateCallResult> {
    const externalCallId = `mock-call-${Math.random().toString(36).slice(2, 10)}`;
    const startedAt = new Date();

    await updateInterview(input.interviewId, {
      external_call_id: externalCallId,
      status: "IN_PROGRESS",
      consent_status: "GRANTED",
      started_at: startedAt.toISOString(),
    });
    await logInterviewEvent(input.interviewId, "CALL_STARTED", { provider: "mock", to: "[MOCK] redacted" });
    await logInterviewEvent(input.interviewId, "AI_INTRO", { message: "[MOCK] AI introduced itself and asked for consent." });
    await logInterviewEvent(input.interviewId, "CONSENT_RECEIVED", { consent: "GRANTED" });

    const primaryRows = await listInterviewQuestions(input.interviewId);
    const primaryOnly = primaryRows.filter((q) => q.question_type === "PRIMARY");

    if (primaryOnly.length === 0) {
      await finalizeInterview(input.interviewId, {
        status: "NEEDS_REVIEW",
        overallScore: null,
        recommendation: "NEEDS_REVIEW",
        confidence: null,
        summary: "[MOCK] No interview questions were planned — needs recruiter review.",
        strengths: [],
        gaps: [],
        concerns: [],
        componentScores: {},
        scoringWeights: {},
        modelName: null,
        modelVersion: null,
        endedAt: new Date().toISOString(),
        durationSeconds: 0,
      });
      return { externalCallId, status: "NEEDS_REVIEW", completedSynchronously: true };
    }

    const finalStatus = await this.runConversation(input.interviewId, primaryOnly, startedAt);
    return { externalCallId, status: finalStatus, completedSynchronously: true };
  }

  private async runConversation(interviewId: string, primaryRows: InterviewQuestion[], startedAt: Date): Promise<string> {
    const aiProvider = getAIProvider();
    const jobTitle = "the role"; // agent supplies richer context via AI calls elsewhere; kept generic here since mock only needs a label

    const turnQuestions: TurnQuestion[] = primaryRows.map((q) => ({
      id: q.id,
      sequence: q.sequence,
      question: q.question,
      category: q.category,
    }));

    let currentIndex = 0;
    let followupCount = 0;
    let pendingQuestion = primaryRows[0];
    let nextSequence = Math.max(...primaryRows.map((q) => q.sequence)) + 1000;
    const transcript: { speaker: "AI" | "CANDIDATE"; text: string }[] = [];

    await logInterviewEvent(interviewId, "QUESTION_ASKED", { question: pendingQuestion.question });
    transcript.push({ speaker: "AI", text: pendingQuestion.question });

    const MAX_TURNS = 40;
    let endedEarly = false;

    for (let turn = 0; turn < MAX_TURNS; turn++) {
      const answerText = cannedAnswerFor(pendingQuestion.category);
      transcript.push({ speaker: "CANDIDATE", text: answerText });

      const decision = await processTurn(
        { jobTitle, primaryQuestions: turnQuestions, currentIndex, followupCountForCurrent: followupCount, latestAnswerText: answerText },
        aiProvider
      );

      if (decision.evaluation) {
        await createInterviewAnswer({
          interviewId,
          questionId: pendingQuestion.id,
          transcript: answerText,
          durationSeconds: 20,
          relevanceScore: decision.evaluation.relevance_score,
          technicalScore: decision.evaluation.technical_score,
          clarityScore: decision.evaluation.clarity_score,
          evidenceQuality: null,
          sufficiency: decision.evaluation.sufficiency,
          evaluation: decision.evaluation.evaluation,
        });
        await logInterviewEvent(interviewId, "ANSWER_RECEIVED", { question_id: pendingQuestion.id, sufficiency: decision.evaluation.sufficiency });
      }

      if (decision.type === "END_CALL") {
        endedEarly = turn < primaryRows.length - 1;
        break;
      }

      if (decision.type === "ASK_FOLLOWUP") {
        followupCount += 1;
        pendingQuestion = await createInterviewQuestion({
          interviewId,
          sequence: nextSequence++,
          section: primaryRows[currentIndex].section,
          category: primaryRows[currentIndex].category,
          question: decision.question,
          questionType: "FOLLOWUP",
          parentQuestionId: primaryRows[currentIndex].id,
        });
        await logInterviewEvent(interviewId, "FOLLOWUP_GENERATED", { question: decision.question });
        transcript.push({ speaker: "AI", text: decision.question });
      } else {
        currentIndex += 1;
        followupCount = 0;
        pendingQuestion = primaryRows[currentIndex];
        await updateInterview(interviewId, { current_question_index: currentIndex });
        await logInterviewEvent(interviewId, "QUESTION_ASKED", { question: pendingQuestion.question });
        transcript.push({ speaker: "AI", text: pendingQuestion.question });
      }
    }

    await logInterviewEvent(interviewId, "SECTION_COMPLETED", {});
    await logInterviewEvent(interviewId, "CALL_ENDED", { reason: endedEarly ? "ended_early" : "plan_completed" });

    const evaluation = await aiProvider.evaluateInterview({
      jobTitle,
      jobDescription: "",
      screeningCriteria: { mandatory: [], preferred: [], experience: { min_years: null, max_years: null } },
      transcript,
    });

    const componentScores = mapInterviewComponentScores(evaluation.component_scores);
    const score = computeWeightedInterviewScore(componentScores);
    const coverage = { questionsAsked: currentIndex + 1, plannedQuestions: primaryRows.length };
    const { recommendation } = decideInterviewRecommendation(score, coverage);

    const endedAt = new Date();
    const durationSeconds = Math.round((endedAt.getTime() - startedAt.getTime()) / 1000);

    await finalizeInterview(interviewId, {
      status: "COMPLETED",
      overallScore: score,
      recommendation,
      confidence: evaluation.confidence,
      summary: `[MOCK] ${evaluation.summary}`,
      strengths: evaluation.strengths,
      gaps: evaluation.gaps,
      concerns: evaluation.concerns,
      componentScores,
      scoringWeights: {
        technicalKnowledge: 0.3,
        problemSolving: 0.2,
        relevantExperience: 0.2,
        roleSpecificSkills: 0.2,
        communicationClarity: 0.1,
      },
      modelName: "anthropic",
      modelVersion: MODEL,
      endedAt: endedAt.toISOString(),
      durationSeconds,
    });
    await logInterviewEvent(interviewId, "EVALUATION_COMPLETED", { recommendation, overall_score: score });

    return "COMPLETED";
  }

  async endCall(): Promise<void> {
    // No-op: the mock call has already completed synchronously.
  }

  async getCallStatus(): Promise<CallStatusResult> {
    return { status: "COMPLETED", durationSeconds: null };
  }

  async getTranscript(): Promise<VoiceTranscriptTurn[]> {
    return [];
  }
}

export const mockVoiceProvider = new MockVoiceProvider();
