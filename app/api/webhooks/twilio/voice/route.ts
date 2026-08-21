import { NextResponse } from "next/server";
import twilio from "twilio";
import type { SupabaseClient } from "@supabase/supabase-js";
import { verifyTwilioSignature } from "@/lib/interview/twilio-signature";
import {
  getInterviewByExternalCallId,
  getInterviewContext,
  listInterviewQuestions,
  createInterviewQuestion,
  createInterviewAnswer,
  updateInterview,
  logInterviewEvent,
  finalizeInterview,
} from "@/lib/services/interviews";
import { processTurn, type TurnQuestion } from "@/lib/interview/conversation";
import {
  interpretConsentResponse,
  computeWeightedInterviewScore,
  decideInterviewRecommendation,
  mapInterviewComponentScores,
  mapRecommendationToStage,
  DEFAULT_INTERVIEW_RUBRIC_WEIGHTS,
} from "@/lib/interview/logic";
import { getAIProvider } from "@/lib/ai";
import { MODEL } from "@/lib/ai/anthropic-provider";
import { createWebhookClient } from "@/lib/supabase/webhook-client";
import { updateApplicationStage } from "@/lib/services/applications";
import { logInternalEvent } from "@/lib/services/ingestion";
import type { InterviewAnswer, InterviewQuestion } from "@/lib/types/database";

const { VoiceResponse } = twilio.twiml;

/**
 * The live, per-turn TwiML conversation loop. Genuinely untested in this
 * environment (see the Phase 5 plan's verification section) — written
 * against Twilio's real, documented <Gather input="speech"> mechanics, not
 * invented. Twilio POSTs application/x-www-form-urlencoded, not JSON.
 */
function xmlResponse(twiml: InstanceType<typeof VoiceResponse>) {
  return new NextResponse(twiml.toString(), { status: 200, headers: { "Content-Type": "text/xml" } });
}

function sayAndGather(webhookUrl: string, prompt: string): NextResponse {
  const twiml = new VoiceResponse();
  const gather = twiml.gather({ input: ["speech"], action: webhookUrl, method: "POST", speechTimeout: "auto" });
  gather.say(prompt);
  twiml.say("We didn't catch that — let's continue.");
  twiml.redirect(webhookUrl);
  return xmlResponse(twiml);
}

function sayAndHangup(message: string): NextResponse {
  const twiml = new VoiceResponse();
  twiml.say(message);
  twiml.hangup();
  return xmlResponse(twiml);
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

/** Mirrors the stage-transition + internal-event bookkeeping that
 * lib/interview/agent.ts's triggerInterview does after a synchronous
 * (mock-provider) completion — real Twilio calls never run that code
 * (triggerInterview returns early once the call is placed, since the rest
 * of the interview plays out entirely through this webhook), so it must
 * happen here instead once the interview is actually finalized, or the
 * candidate is left stuck at AI_INTERVIEW forever. */
async function advanceStageAfterInterviewFinalized(
  applicationId: string,
  candidateId: string,
  jobId: string,
  interviewId: string,
  recommendation: string | null,
  status: string,
  overallScore: number | null,
  supabase: SupabaseClient
): Promise<void> {
  const finalStage = mapRecommendationToStage(recommendation, status);
  await updateApplicationStage(
    applicationId,
    "AI_INTERVIEW",
    finalStage,
    "AI interview completed",
    { source: "interview", decision_source: "AI", interview_id: interviewId },
    supabase
  );

  await logInternalEvent(
    "candidate.interview.completed",
    {
      application_id: applicationId,
      candidate_id: candidateId,
      job_id: jobId,
      payload: { recommendation, overall_score: overallScore },
    },
    supabase
  );
}

async function finalizeCompletedInterview(
  interviewId: string,
  applicationId: string,
  candidateId: string,
  jobId: string,
  jobTitle: string,
  jobDescription: string,
  screeningCriteria: NonNullable<Awaited<ReturnType<typeof getInterviewContext>>>["screeningCriteria"],
  allQuestions: InterviewQuestion[],
  currentIndex: number,
  plannedQuestionCount: number,
  supabase: SupabaseClient
): Promise<void> {
  const { data: answerRows } = await supabase
    .from("interview_answers")
    .select("*")
    .in(
      "question_id",
      allQuestions.map((q) => q.id)
    );
  const answers = (answerRows ?? []) as InterviewAnswer[];
  const transcript = buildTranscript(allQuestions, answers);

  const evaluation = await getAIProvider().evaluateInterview({
    jobTitle,
    jobDescription,
    screeningCriteria: screeningCriteria!,
    transcript,
  });

  const componentScores = mapInterviewComponentScores(evaluation.component_scores);
  const score = computeWeightedInterviewScore(componentScores);
  const { recommendation } = decideInterviewRecommendation(score, {
    questionsAsked: currentIndex + 1,
    plannedQuestions: plannedQuestionCount,
  });

  await finalizeInterview(
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
    supabase
  );
  await logInterviewEvent(interviewId, "EVALUATION_COMPLETED", { recommendation, overall_score: score }, supabase);

  await advanceStageAfterInterviewFinalized(applicationId, candidateId, jobId, interviewId, recommendation, "COMPLETED", score, supabase);
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const params = Object.fromEntries(new URLSearchParams(rawBody));
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const base = process.env.TWILIO_VOICE_WEBHOOK_BASE_URL;

  if (!authToken || !base) {
    return NextResponse.json({ error: "Twilio is not configured." }, { status: 500 });
  }

  const webhookUrl = `${base.replace(/\/$/, "")}/api/webhooks/twilio/voice`;
  const signature = request.headers.get("x-twilio-signature");
  if (!verifyTwilioSignature(webhookUrl, params, signature, authToken)) {
    return NextResponse.json({ error: "Invalid Twilio signature." }, { status: 401 });
  }

  const callSid = params.CallSid;
  if (!callSid) {
    return NextResponse.json({ error: "Missing CallSid." }, { status: 400 });
  }

  const supabase = createWebhookClient();
  const interview = await getInterviewByExternalCallId(callSid, supabase);
  if (!interview) {
    return sayAndHangup("We're sorry, this interview could not be found. Goodbye.");
  }

  const context = await getInterviewContext(interview.id, supabase);
  if (!context || !context.screeningCriteria) {
    return sayAndHangup("We're sorry, an internal error occurred. Goodbye.");
  }

  const speechResult = params.SpeechResult;

  // ---- Consent phase ----
  if (interview.consent_status === "PENDING") {
    if (!speechResult) {
      await logInterviewEvent(interview.id, "CALL_STARTED", { call_sid: callSid }, supabase);
      await logInterviewEvent(interview.id, "AI_INTRO", {}, supabase);
      await updateInterview(interview.id, { status: "IN_PROGRESS", started_at: new Date().toISOString() }, supabase);
      const personaName = process.env.INTERVIEWER_PERSONA_NAME || "Alex";
      return sayAndGather(
        webhookUrl,
        `Hi ${context.candidateName}, this is ${personaName} calling from ${context.companyName}. You applied for the ${context.jobTitle} position, and I'll be asking a few questions based on your resume as part of our interview process. This interview will be evaluated as part of the recruitment process. Are you comfortable continuing?`
      );
    }

    const consent = interpretConsentResponse(speechResult);
    if (consent === "DECLINED") {
      await logInterviewEvent(interview.id, "CONSENT_DECLINED", { transcript: speechResult }, supabase);
      await updateInterview(
        interview.id,
        { consent_status: "DECLINED", status: "CONSENT_DECLINED", ended_at: new Date().toISOString() },
        supabase
      );
      return sayAndHangup("No problem — thank you for your time. Have a great day.");
    }
    if (consent === "UNCLEAR") {
      return sayAndGather(webhookUrl, "Sorry, I didn't quite catch that. Are you comfortable continuing with this interview? Please say yes or no.");
    }

    await logInterviewEvent(interview.id, "CONSENT_RECEIVED", { transcript: speechResult }, supabase);
    await updateInterview(interview.id, { consent_status: "GRANTED" }, supabase);

    const questions = await listInterviewQuestions(interview.id, supabase);
    const firstPrimary = questions.filter((q) => q.question_type === "PRIMARY")[0];
    if (!firstPrimary) {
      await finalizeInterview(
        interview.id,
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
        supabase
      );
      await advanceStageAfterInterviewFinalized(
        context.applicationId,
        context.candidateId,
        context.jobId,
        interview.id,
        "NEEDS_REVIEW",
        "NEEDS_REVIEW",
        null,
        supabase
      );
      return sayAndHangup("Thank you — that concludes our call today. We'll be in touch about next steps. Goodbye.");
    }

    await logInterviewEvent(interview.id, "QUESTION_ASKED", { question: firstPrimary.question }, supabase);
    return sayAndGather(webhookUrl, firstPrimary.question);
  }

  // ---- Q&A phase ----
  const allQuestions = await listInterviewQuestions(interview.id, supabase);
  const primaryQuestions = allQuestions.filter((q) => q.question_type === "PRIMARY");
  const turnQuestions: TurnQuestion[] = primaryQuestions.map((q) => ({ id: q.id, sequence: q.sequence, question: q.question, category: q.category }));

  const currentIndex = interview.current_question_index;
  const currentPrimary = primaryQuestions[currentIndex];

  if (!speechResult || !currentPrimary) {
    return sayAndHangup("We're sorry, something went wrong on our end. We'll follow up separately. Goodbye.");
  }

  const followupsForCurrent = allQuestions.filter((q) => q.question_type === "FOLLOWUP" && q.parent_question_id === currentPrimary.id);

  const decision = await processTurn(
    {
      jobTitle: context.jobTitle,
      primaryQuestions: turnQuestions,
      currentIndex,
      followupCountForCurrent: followupsForCurrent.length,
      latestAnswerText: speechResult,
    },
    getAIProvider()
  );

  const answeredQuestion = followupsForCurrent.length > 0 ? followupsForCurrent[followupsForCurrent.length - 1] : currentPrimary;

  if (decision.evaluation) {
    await createInterviewAnswer(
      {
        interviewId: interview.id,
        questionId: answeredQuestion.id,
        transcript: speechResult,
        durationSeconds: null,
        relevanceScore: decision.evaluation.relevance_score,
        technicalScore: decision.evaluation.technical_score,
        clarityScore: decision.evaluation.clarity_score,
        evidenceQuality: null,
        sufficiency: decision.evaluation.sufficiency,
        evaluation: decision.evaluation.evaluation,
      },
      supabase
    );
    await logInterviewEvent(
      interview.id,
      "ANSWER_RECEIVED",
      { question_id: answeredQuestion.id, sufficiency: decision.evaluation.sufficiency },
      supabase
    );
  }

  if (decision.type === "END_CALL") {
    await logInterviewEvent(interview.id, "CALL_ENDED", { reason: decision.reason }, supabase);
    await finalizeCompletedInterview(
      interview.id,
      context.applicationId,
      context.candidateId,
      context.jobId,
      context.jobTitle,
      context.jobDescription,
      context.screeningCriteria,
      allQuestions,
      currentIndex,
      primaryQuestions.length,
      supabase
    );
    return sayAndHangup(
      "Thank you for your time — that concludes the interview. Your responses will be reviewed as part of the recruitment process. We'll be in touch about next steps."
    );
  }

  if (decision.type === "ASK_FOLLOWUP") {
    const nextSequence = Math.max(...allQuestions.map((q) => q.sequence)) + 1000;
    await createInterviewQuestion(
      {
        interviewId: interview.id,
        sequence: nextSequence,
        section: currentPrimary.section,
        category: currentPrimary.category,
        question: decision.question,
        questionType: "FOLLOWUP",
        parentQuestionId: currentPrimary.id,
      },
      supabase
    );
    await logInterviewEvent(interview.id, "FOLLOWUP_GENERATED", { question: decision.question }, supabase);
    return sayAndGather(webhookUrl, decision.question);
  }

  // ASK_QUESTION -> advance to the next primary question.
  await updateInterview(interview.id, { current_question_index: currentIndex + 1 }, supabase);
  await logInterviewEvent(interview.id, "QUESTION_ASKED", { question: decision.question }, supabase);
  return sayAndGather(webhookUrl, decision.question);
}
