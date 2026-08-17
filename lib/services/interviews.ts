import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { computeNextVersionNumber } from "@/lib/jd/logic";
import type { ScreeningCriteria } from "@/lib/ai/schemas";
import type {
  Interview,
  InterviewQuestion,
  InterviewAnswer,
  InterviewStatus,
  InterviewProvider,
  ConsentStatus,
  InterviewRecommendation,
  InterviewConfidence,
  InterviewComponentScores,
  InterviewQuestionType,
  AnswerSufficiency,
  InterviewEventType,
} from "@/lib/types/database";

/** Every function accepts an optional Supabase client — the Twilio webhook
 * routes run with no user session and must pass the service-role client
 * from lib/supabase/webhook-client.ts explicitly, exactly like
 * lib/services/agent-runs.ts already supports. */
async function resolveClient(client?: SupabaseClient): Promise<SupabaseClient> {
  if (client) return client;
  return (await createServerClient()) as unknown as SupabaseClient;
}

export interface CreateInterviewInput {
  applicationId: string;
  agentRunId: string | null;
  jdVersionId: string | null;
  screeningVersionId: string | null;
  provider: InterviewProvider;
  recordingEnabled: boolean;
  attemptNumber: number;
  maxAttempts: number;
}

/** Never overwrites history — flips the prior "latest" row, inserts a new
 * versioned interview row (mirrors lib/services/screening.ts's
 * createScreening). */
export async function createInterview(input: CreateInterviewInput, client?: SupabaseClient): Promise<Interview> {
  const supabase = await resolveClient(client);

  const { data: latest, error: latestError } = await supabase
    .from("interviews")
    .select("interview_version")
    .eq("application_id", input.applicationId)
    .order("interview_version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latestError) throw latestError;

  const nextVersion = computeNextVersionNumber(latest?.interview_version);

  const { error: unflagError } = await supabase
    .from("interviews")
    .update({ is_latest: false })
    .eq("application_id", input.applicationId)
    .eq("is_latest", true);
  if (unflagError) throw unflagError;

  const { data, error } = await supabase
    .from("interviews")
    .insert({
      application_id: input.applicationId,
      agent_run_id: input.agentRunId,
      jd_version_id: input.jdVersionId,
      screening_version_id: input.screeningVersionId,
      interview_version: nextVersion,
      status: "QUEUED",
      provider: input.provider,
      consent_status: "PENDING",
      attempt_number: input.attemptNumber,
      max_attempts: input.maxAttempts,
      is_latest: true,
      recording_enabled: input.recordingEnabled,
      current_question_index: 0,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as Interview;
}

export async function getInterview(interviewId: string, client?: SupabaseClient): Promise<Interview | null> {
  const supabase = await resolveClient(client);
  const { data, error } = await supabase.from("interviews").select("*").eq("id", interviewId).maybeSingle();
  if (error) throw error;
  return data as Interview | null;
}

export async function getInterviewByExternalCallId(externalCallId: string, client?: SupabaseClient): Promise<Interview | null> {
  const supabase = await resolveClient(client);
  const { data, error } = await supabase.from("interviews").select("*").eq("external_call_id", externalCallId).maybeSingle();
  if (error) throw error;
  return data as Interview | null;
}

export interface InterviewContext {
  applicationId: string;
  jobId: string;
  candidateId: string;
  jobTitle: string;
  jobDescription: string;
  screeningCriteria: ScreeningCriteria | null;
}

/** Joins interviews -> applications -> jobs in one query so the Twilio
 * webhook route (no session, no access to the session-bound lib/services/jobs.ts
 * getJob helper) can load the context it needs via the service-role client. */
export async function getInterviewContext(interviewId: string, client?: SupabaseClient): Promise<InterviewContext | null> {
  const supabase = await resolveClient(client);
  const { data, error } = await supabase
    .from("interviews")
    .select("application_id, application:applications(job_id, candidate_id, job:jobs(title, description, screening_criteria))")
    .eq("id", interviewId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const application = data.application as unknown as {
    job_id: string;
    candidate_id: string;
    job: { title: string; description: string; screening_criteria: ScreeningCriteria | null };
  };

  return {
    applicationId: data.application_id as string,
    jobId: application.job_id,
    candidateId: application.candidate_id,
    jobTitle: application.job.title,
    jobDescription: application.job.description,
    screeningCriteria: application.job.screening_criteria,
  };
}

export interface InterviewWithTranscript extends Interview {
  questions: InterviewQuestion[];
  answers: InterviewAnswer[];
}

export async function getLatestInterview(applicationId: string, client?: SupabaseClient): Promise<InterviewWithTranscript | null> {
  const supabase = await resolveClient(client);
  const { data: interview, error } = await supabase
    .from("interviews")
    .select("*")
    .eq("application_id", applicationId)
    .eq("is_latest", true)
    .maybeSingle();
  if (error) throw error;
  if (!interview) return null;

  const [{ data: questions, error: qError }, { data: answers, error: aError }] = await Promise.all([
    supabase.from("interview_questions").select("*").eq("interview_id", interview.id).order("sequence", { ascending: true }),
    supabase.from("interview_answers").select("*").eq("interview_id", interview.id).order("created_at", { ascending: true }),
  ]);
  if (qError) throw qError;
  if (aError) throw aError;

  return {
    ...(interview as Interview),
    questions: (questions ?? []) as InterviewQuestion[],
    answers: (answers ?? []) as InterviewAnswer[],
  };
}

export async function updateInterview(
  interviewId: string,
  fields: Partial<
    Pick<
      Interview,
      | "status"
      | "external_call_id"
      | "consent_status"
      | "started_at"
      | "ended_at"
      | "duration_seconds"
      | "current_section"
      | "current_question_index"
    >
  >,
  client?: SupabaseClient
): Promise<void> {
  const supabase = await resolveClient(client);
  const { error } = await supabase.from("interviews").update(fields).eq("id", interviewId);
  if (error) throw error;
}

export interface FinalizeInterviewInput {
  status: InterviewStatus;
  overallScore: number | null;
  recommendation: InterviewRecommendation | null;
  confidence: InterviewConfidence | null;
  summary: string | null;
  strengths: string[];
  gaps: string[];
  concerns: string[];
  componentScores: Partial<InterviewComponentScores>;
  scoringWeights: Partial<InterviewComponentScores>;
  modelName: string | null;
  modelVersion: string | null;
  endedAt: string;
  durationSeconds: number | null;
}

/** Writes the final evaluation onto the interview row — called once,
 * either at the end of the mock's synchronous loop or from the Twilio
 * status webhook when the call completes. */
export async function finalizeInterview(interviewId: string, input: FinalizeInterviewInput, client?: SupabaseClient): Promise<Interview> {
  const supabase = await resolveClient(client);
  const { data, error } = await supabase
    .from("interviews")
    .update({
      status: input.status,
      overall_score: input.overallScore,
      recommendation: input.recommendation,
      confidence: input.confidence,
      summary: input.summary,
      strengths: input.strengths,
      gaps: input.gaps,
      concerns: input.concerns,
      component_scores: input.componentScores,
      scoring_weights: input.scoringWeights,
      model_name: input.modelName,
      model_version: input.modelVersion,
      ended_at: input.endedAt,
      duration_seconds: input.durationSeconds,
    })
    .eq("id", interviewId)
    .select("*")
    .single();
  if (error) throw error;
  return data as Interview;
}

export interface CreateInterviewQuestionInput {
  interviewId: string;
  sequence: number;
  section: string;
  category: string | null;
  question: string;
  questionType: InterviewQuestionType;
  parentQuestionId: string | null;
}

export async function createInterviewQuestion(input: CreateInterviewQuestionInput, client?: SupabaseClient): Promise<InterviewQuestion> {
  const supabase = await resolveClient(client);
  const { data, error } = await supabase
    .from("interview_questions")
    .insert({
      interview_id: input.interviewId,
      sequence: input.sequence,
      section: input.section,
      category: input.category,
      question: input.question,
      question_type: input.questionType,
      parent_question_id: input.parentQuestionId,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as InterviewQuestion;
}

export async function listInterviewQuestions(interviewId: string, client?: SupabaseClient): Promise<InterviewQuestion[]> {
  const supabase = await resolveClient(client);
  const { data, error } = await supabase
    .from("interview_questions")
    .select("*")
    .eq("interview_id", interviewId)
    .order("sequence", { ascending: true });
  if (error) throw error;
  return (data ?? []) as InterviewQuestion[];
}

export interface CreateInterviewAnswerInput {
  interviewId: string;
  questionId: string;
  transcript: string;
  durationSeconds: number | null;
  relevanceScore: number | null;
  technicalScore: number | null;
  clarityScore: number | null;
  evidenceQuality: string | null;
  sufficiency: AnswerSufficiency | null;
  evaluation: string | null;
}

export async function createInterviewAnswer(input: CreateInterviewAnswerInput, client?: SupabaseClient): Promise<InterviewAnswer> {
  const supabase = await resolveClient(client);
  const { data, error } = await supabase
    .from("interview_answers")
    .insert({
      interview_id: input.interviewId,
      question_id: input.questionId,
      transcript: input.transcript,
      duration_seconds: input.durationSeconds,
      relevance_score: input.relevanceScore,
      technical_score: input.technicalScore,
      clarity_score: input.clarityScore,
      evidence_quality: input.evidenceQuality,
      sufficiency: input.sufficiency,
      evaluation: input.evaluation,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as InterviewAnswer;
}

export async function logInterviewEvent(
  interviewId: string,
  eventType: InterviewEventType,
  metadata: Record<string, unknown> = {},
  client?: SupabaseClient
): Promise<void> {
  const supabase = await resolveClient(client);
  const { error } = await supabase.from("interview_events").insert({ interview_id: interviewId, event_type: eventType, metadata });
  if (error) throw error;
}

/** Batched lookup (not N+1) of the latest interview status/recommendation
 * per application id — feeds queue/table views. */
export async function listLatestInterviewSummaries(
  applicationIds: string[],
  client?: SupabaseClient
): Promise<Map<string, Pick<Interview, "status" | "recommendation" | "overall_score">>> {
  const map = new Map<string, Pick<Interview, "status" | "recommendation" | "overall_score">>();
  if (applicationIds.length === 0) return map;

  const supabase = await resolveClient(client);
  const { data, error } = await supabase
    .from("interviews")
    .select("application_id, status, recommendation, overall_score")
    .in("application_id", applicationIds)
    .eq("is_latest", true);
  if (error) throw error;

  for (const row of data ?? []) {
    map.set(row.application_id as string, {
      status: row.status as InterviewStatus,
      recommendation: row.recommendation as InterviewRecommendation | null,
      overall_score: row.overall_score as number | null,
    });
  }
  return map;
}

export interface InterviewAgentSummary {
  lastInterview: Interview | null;
  interviewsLast24h: number;
}

export async function getInterviewAgentSummary(client?: SupabaseClient): Promise<InterviewAgentSummary> {
  const supabase = await resolveClient(client);

  const { data: lastInterview, error: lastError } = await supabase
    .from("interviews")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (lastError) throw lastError;

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count, error: countError } = await supabase
    .from("interviews")
    .select("id", { count: "exact", head: true })
    .gte("created_at", since);
  if (countError) throw countError;

  return { lastInterview: (lastInterview as Interview | null) ?? null, interviewsLast24h: count ?? 0 };
}

export type { ConsentStatus };
