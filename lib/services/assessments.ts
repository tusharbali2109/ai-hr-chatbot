import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { computeNextVersionNumber } from "@/lib/jd/logic";
import type { AssessmentQuestionGeneration } from "@/lib/ai/schemas";
import type {
  Assessment,
  AssessmentQuestion,
  AssessmentQuestionPublic,
  AssessmentAssignment,
  AssessmentAnswer,
  AssessmentQuestionEvaluation,
  AssessmentEvent,
  AssessmentEventType,
  AssessmentStatus,
  AssessmentRecommendation,
  AssignmentStatus,
  OpenEndedReviewResult,
} from "@/lib/types/database";
import type { DeadlineConfig } from "@/lib/assessment/logic";

/** Every function accepts an optional Supabase client — the cron/expiration
 * route runs with no user session and must pass the service-role client
 * explicitly, exactly like lib/services/interviews.ts already supports. */
async function resolveClient(client?: SupabaseClient): Promise<SupabaseClient> {
  if (client) return client;
  return (await createServerClient()) as unknown as SupabaseClient;
}

export interface CreateAssessmentInput {
  jobId: string;
  createdBy: string | null;
  title: string;
  description: string;
  instructions: string;
  type: string;
  durationMinutes: number | null;
  passingScore: number;
  deadlineConfig: DeadlineConfig;
  questions: AssessmentQuestionGeneration[];
}

/** Never overwrites history — flips the prior "latest" row, inserts a new
 * versioned assessment + its questions (mirrors lib/services/interviews.ts's
 * createInterview / lib/services/jd.ts's saveJdVersion). Always starts DRAFT
 * — recruiter review/approval is a separate step (spec §25). */
export async function createAssessmentVersion(input: CreateAssessmentInput, client?: SupabaseClient): Promise<Assessment> {
  const supabase = await resolveClient(client);

  const { data: latest, error: latestError } = await supabase
    .from("assessments")
    .select("assessment_version")
    .eq("job_id", input.jobId)
    .order("assessment_version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latestError) throw latestError;

  const nextVersion = computeNextVersionNumber(latest?.assessment_version);

  const { error: unflagError } = await supabase
    .from("assessments")
    .update({ is_latest: false })
    .eq("job_id", input.jobId)
    .eq("is_latest", true);
  if (unflagError) throw unflagError;

  const { data: assessment, error } = await supabase
    .from("assessments")
    .insert({
      job_id: input.jobId,
      created_by: input.createdBy,
      title: input.title,
      description: input.description,
      instructions: input.instructions,
      type: input.type,
      duration_minutes: input.durationMinutes,
      passing_score: input.passingScore,
      status: "DRAFT",
      assessment_version: nextVersion,
      is_latest: true,
      deadline_unit: input.deadlineConfig.unit,
      deadline_value: input.deadlineConfig.value,
    })
    .select("*")
    .single();
  if (error) throw error;

  if (input.questions.length > 0) {
    const { error: qError } = await supabase.from("assessment_questions").insert(
      input.questions.map((q) => ({
        assessment_id: assessment.id,
        sequence: q.sequence,
        type: q.type,
        question: q.question,
        instructions: q.instructions,
        points: q.points,
        difficulty: q.difficulty,
        options: q.options,
        expected_answer: q.expected_answer,
        evaluation_criteria: q.evaluation_criteria,
      }))
    );
    if (qError) throw qError;
  }

  return assessment as Assessment;
}

export interface CreateOpenEndedAssessmentInput {
  jobId: string;
  createdBy: string | null;
  title: string;
  briefFilePath: string;
  briefText: string;
}

/**
 * The open-ended counterpart to createAssessmentVersion: no AI-generated
 * questions, no builder/DRAFT review step — the recruiter's uploaded brief
 * IS the finished assessment, so this starts straight at READY, exactly the
 * status createAssignment (lib/assessment/agent.ts) already requires before
 * it can be assigned/emailed to a candidate. Everything downstream
 * (assignment creation, invitation email, automation rules) is shared with
 * structured assessments unchanged.
 */
export async function createOpenEndedAssessment(input: CreateOpenEndedAssessmentInput, client?: SupabaseClient): Promise<Assessment> {
  const supabase = await resolveClient(client);

  const { data: latest, error: latestError } = await supabase
    .from("assessments")
    .select("assessment_version")
    .eq("job_id", input.jobId)
    .order("assessment_version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latestError) throw latestError;

  const nextVersion = computeNextVersionNumber(latest?.assessment_version);

  const { error: unflagError } = await supabase
    .from("assessments")
    .update({ is_latest: false })
    .eq("job_id", input.jobId)
    .eq("is_latest", true);
  if (unflagError) throw unflagError;

  const { data: assessment, error } = await supabase
    .from("assessments")
    .insert({
      job_id: input.jobId,
      created_by: input.createdBy,
      title: input.title,
      description: "Open-ended task — see the attached brief for full details.",
      instructions: "Complete the task described in the brief and return your work to the recruiter.",
      type: "CUSTOM",
      duration_minutes: null,
      passing_score: 0,
      status: "READY",
      assessment_version: nextVersion,
      is_latest: true,
      deadline_unit: "DAYS",
      deadline_value: 7,
      assessment_type: "OPEN_ENDED",
      brief_file_path: input.briefFilePath,
      brief_text: input.briefText,
    })
    .select("*")
    .single();
  if (error) throw error;

  return assessment as Assessment;
}

export async function getAssessment(assessmentId: string, client?: SupabaseClient): Promise<Assessment | null> {
  const supabase = await resolveClient(client);
  const { data, error } = await supabase.from("assessments").select("*").eq("id", assessmentId).maybeSingle();
  if (error) throw error;
  return data as Assessment | null;
}

export async function getLatestAssessmentForJob(jobId: string, client?: SupabaseClient): Promise<Assessment | null> {
  const supabase = await resolveClient(client);
  const { data, error } = await supabase
    .from("assessments")
    .select("*")
    .eq("job_id", jobId)
    .eq("is_latest", true)
    .maybeSingle();
  if (error) throw error;
  return data as Assessment | null;
}

export async function listAssessmentsForCompany(client?: SupabaseClient): Promise<(Assessment & { job_title: string })[]> {
  const supabase = await resolveClient(client);
  const { data, error } = await supabase
    .from("assessments")
    .select("*, job:jobs(title)")
    .eq("is_latest", true)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => {
    const { job, ...rest } = row as unknown as Assessment & { job: { title: string } | null };
    return { ...rest, job_title: job?.title ?? "" };
  });
}

export async function updateAssessmentStatus(assessmentId: string, status: AssessmentStatus, client?: SupabaseClient): Promise<void> {
  const supabase = await resolveClient(client);
  const { error } = await supabase.from("assessments").update({ status }).eq("id", assessmentId);
  if (error) throw error;
}

export interface UpdateAssessmentMetaInput {
  title?: string;
  description?: string;
  instructions?: string;
  type?: string;
  durationMinutes?: number | null;
  passingScore?: number;
  deadlineConfig?: DeadlineConfig;
  autoSubmitOnExpiry?: boolean;
}

/** Builder edits to the assessment's own fields — only meaningful while
 * still DRAFT (enforced by the caller, same rule as question edits). */
export async function updateAssessmentMeta(assessmentId: string, input: UpdateAssessmentMetaInput, client?: SupabaseClient): Promise<Assessment> {
  const supabase = await resolveClient(client);
  const fields: Record<string, unknown> = {};
  if (input.title !== undefined) fields.title = input.title;
  if (input.description !== undefined) fields.description = input.description;
  if (input.instructions !== undefined) fields.instructions = input.instructions;
  if (input.type !== undefined) fields.type = input.type;
  if (input.durationMinutes !== undefined) fields.duration_minutes = input.durationMinutes;
  if (input.passingScore !== undefined) fields.passing_score = input.passingScore;
  if (input.deadlineConfig !== undefined) {
    fields.deadline_unit = input.deadlineConfig.unit;
    fields.deadline_value = input.deadlineConfig.value;
  }
  if (input.autoSubmitOnExpiry !== undefined) fields.auto_submit_on_expiry = input.autoSubmitOnExpiry;

  const { data, error } = await supabase.from("assessments").update(fields).eq("id", assessmentId).select("*").single();
  if (error) throw error;
  return data as Assessment;
}

export async function listAssessmentQuestions(assessmentId: string, client?: SupabaseClient): Promise<AssessmentQuestion[]> {
  const supabase = await resolveClient(client);
  const { data, error } = await supabase
    .from("assessment_questions")
    .select("*")
    .eq("assessment_id", assessmentId)
    .order("sequence", { ascending: true });
  if (error) throw error;
  return (data ?? []) as AssessmentQuestion[];
}

/** Candidate-safe read — queries the view that excludes expected_answer /
 * evaluation_criteria entirely, never the base table. */
export async function listAssessmentQuestionsPublic(assessmentId: string, client?: SupabaseClient): Promise<AssessmentQuestionPublic[]> {
  const supabase = await resolveClient(client);
  const { data, error } = await supabase
    .from("assessment_questions_public")
    .select("*")
    .eq("assessment_id", assessmentId)
    .order("sequence", { ascending: true });
  if (error) throw error;
  return (data ?? []) as AssessmentQuestionPublic[];
}

export interface UpsertQuestionInput {
  id?: string;
  assessmentId: string;
  sequence: number;
  type: string;
  question: string;
  instructions: string | null;
  points: number;
  difficulty: string;
  options: string[] | null;
  expectedAnswer: string | null;
  evaluationCriteria: string | null;
}

/** Builder edits — only valid while the assessment is still DRAFT with zero
 * assignments (enforced by the caller in lib/actions/assessment.ts per
 * spec §26 — an assessment with active assignments must be edited via a
 * new version, never mutated in place). */
export async function upsertAssessmentQuestion(input: UpsertQuestionInput, client?: SupabaseClient): Promise<AssessmentQuestion> {
  const supabase = await resolveClient(client);
  const row = {
    assessment_id: input.assessmentId,
    sequence: input.sequence,
    type: input.type,
    question: input.question,
    instructions: input.instructions,
    points: input.points,
    difficulty: input.difficulty,
    options: input.options,
    expected_answer: input.expectedAnswer,
    evaluation_criteria: input.evaluationCriteria,
  };

  if (input.id) {
    const { data, error } = await supabase.from("assessment_questions").update(row).eq("id", input.id).select("*").single();
    if (error) throw error;
    return data as AssessmentQuestion;
  }

  const { data, error } = await supabase.from("assessment_questions").insert(row).select("*").single();
  if (error) throw error;
  return data as AssessmentQuestion;
}

export async function deleteAssessmentQuestion(questionId: string, client?: SupabaseClient): Promise<void> {
  const supabase = await resolveClient(client);
  const { error } = await supabase.from("assessment_questions").delete().eq("id", questionId);
  if (error) throw error;
}

export async function reorderAssessmentQuestions(orderedIds: string[], client?: SupabaseClient): Promise<void> {
  const supabase = await resolveClient(client);
  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await supabase.from("assessment_questions").update({ sequence: i + 1 }).eq("id", orderedIds[i]);
    if (error) throw error;
  }
}

export interface CreateAssignmentInput {
  assessmentId: string;
  applicationId: string;
  candidateId: string;
  assignedAt: string;
  deadline: string;
}

export async function createAssignment(input: CreateAssignmentInput, client?: SupabaseClient): Promise<AssessmentAssignment> {
  const supabase = await resolveClient(client);
  const { data, error } = await supabase
    .from("assessment_assignments")
    .insert({
      assessment_id: input.assessmentId,
      application_id: input.applicationId,
      candidate_id: input.candidateId,
      status: "ASSIGNED",
      assigned_at: input.assignedAt,
      deadline: input.deadline,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as AssessmentAssignment;
}

export async function getActiveAssignmentForApplication(
  applicationId: string,
  client?: SupabaseClient
): Promise<AssessmentAssignment | null> {
  const supabase = await resolveClient(client);
  const { data, error } = await supabase
    .from("assessment_assignments")
    .select("*")
    .eq("application_id", applicationId)
    .in("status", ["ASSIGNED", "STARTED", "SUBMITTED", "EVALUATING"])
    .maybeSingle();
  if (error) throw error;
  return data as AssessmentAssignment | null;
}

/** Most recent assignment for an application regardless of status — used
 * for display (score/recommendation after COMPLETED), unlike
 * getActiveAssignmentForApplication which only returns in-flight ones. */
export async function getLatestAssignmentForApplication(applicationId: string, client?: SupabaseClient): Promise<AssessmentAssignment | null> {
  const supabase = await resolveClient(client);
  const { data, error } = await supabase
    .from("assessment_assignments")
    .select("*")
    .eq("application_id", applicationId)
    .order("assigned_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as AssessmentAssignment | null;
}

export async function getAssignment(assignmentId: string, client?: SupabaseClient): Promise<AssessmentAssignment | null> {
  const supabase = await resolveClient(client);
  const { data, error } = await supabase.from("assessment_assignments").select("*").eq("id", assignmentId).maybeSingle();
  if (error) throw error;
  return data as AssessmentAssignment | null;
}

/** The candidate's own latest non-cancelled assignment, RLS-scoped to their
 * linked candidate row (candidate_id_for_auth() in the migration). */
export async function getCurrentAssignmentForCandidate(client?: SupabaseClient): Promise<AssessmentAssignment | null> {
  const supabase = await resolveClient(client);
  const { data, error } = await supabase
    .from("assessment_assignments")
    .select("*")
    .neq("status", "CANCELLED")
    .order("assigned_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as AssessmentAssignment | null;
}

export async function updateAssignmentStatus(
  assignmentId: string,
  fields: Partial<Pick<AssessmentAssignment, "status" | "started_at" | "submitted_at" | "score" | "recommendation">>,
  client?: SupabaseClient
): Promise<void> {
  const supabase = await resolveClient(client);
  const { error } = await supabase.from("assessment_assignments").update(fields).eq("id", assignmentId);
  if (error) throw error;
}

/** Records the recruiter-uploaded completed submission for an open-ended
 * assignment (received outside the platform) — separate from
 * updateAssignmentStatus/lockAnswersAsSubmitted, which govern the
 * structured in-platform answer flow. */
export async function saveOpenEndedSubmission(
  assignmentId: string,
  fields: { filePath: string; text: string },
  client?: SupabaseClient
): Promise<void> {
  const supabase = await resolveClient(client);
  const { error } = await supabase
    .from("assessment_assignments")
    .update({ submission_file_path: fields.filePath, submission_text: fields.text })
    .eq("id", assignmentId);
  if (error) throw error;
}

export async function saveOpenEndedReview(assignmentId: string, review: OpenEndedReviewResult, client?: SupabaseClient): Promise<void> {
  const supabase = await resolveClient(client);
  const { error } = await supabase
    .from("assessment_assignments")
    .update({ ai_review: review, ai_review_generated_at: new Date().toISOString() })
    .eq("id", assignmentId);
  if (error) throw error;
}

/** First candidate interaction with the portal moves ASSIGNED -> STARTED.
 * No-op (does not overwrite started_at) if already started. */
export async function markAssignmentStarted(assignmentId: string, client?: SupabaseClient): Promise<void> {
  const supabase = await resolveClient(client);
  const assignment = await getAssignment(assignmentId, supabase);
  if (!assignment || assignment.status !== "ASSIGNED") return;
  await updateAssignmentStatus(assignmentId, { status: "STARTED", started_at: new Date().toISOString() }, supabase);
  await logAssessmentEvent(assignmentId, "STARTED", {}, supabase);
}

export async function listAnswersForAssignment(assignmentId: string, client?: SupabaseClient): Promise<AssessmentAnswer[]> {
  const supabase = await resolveClient(client);
  const { data, error } = await supabase.from("assessment_answers").select("*").eq("assignment_id", assignmentId);
  if (error) throw error;
  return (data ?? []) as AssessmentAnswer[];
}

export interface UpsertAnswerInput {
  assignmentId: string;
  questionId: string;
  answerText?: string | null;
  selectedOption?: string | null;
  code?: string | null;
  fileUrl?: string | null;
}

/** Autosave — one row per question, upserted on (assignment_id, question_id).
 * Server-side persistence per spec §9: survives refresh/disconnect since
 * it's never held only in client state. */
export async function upsertAnswer(input: UpsertAnswerInput, client?: SupabaseClient): Promise<AssessmentAnswer> {
  const supabase = await resolveClient(client);
  const { data, error } = await supabase
    .from("assessment_answers")
    .upsert(
      {
        assignment_id: input.assignmentId,
        question_id: input.questionId,
        answer_text: input.answerText ?? null,
        selected_option: input.selectedOption ?? null,
        code: input.code ?? null,
        file_url: input.fileUrl ?? null,
        auto_saved_at: new Date().toISOString(),
      },
      { onConflict: "assignment_id,question_id" }
    )
    .select("*")
    .single();
  if (error) throw error;
  return data as AssessmentAnswer;
}

export async function lockAnswersAsSubmitted(assignmentId: string, client?: SupabaseClient): Promise<void> {
  const supabase = await resolveClient(client);
  const { error } = await supabase
    .from("assessment_answers")
    .update({ submitted_at: new Date().toISOString() })
    .eq("assignment_id", assignmentId);
  if (error) throw error;
}

export async function createQuestionEvaluation(
  input: {
    assignmentId: string;
    questionId: string;
    score: number;
    maxScore: number;
    evaluation: string;
    evidence: string | null;
    confidence: "HIGH" | "MEDIUM" | "LOW";
  },
  client?: SupabaseClient
): Promise<AssessmentQuestionEvaluation> {
  const supabase = await resolveClient(client);
  const { data, error } = await supabase
    .from("assessment_question_evaluations")
    .insert({
      assignment_id: input.assignmentId,
      question_id: input.questionId,
      score: input.score,
      max_score: input.maxScore,
      evaluation: input.evaluation,
      evidence: input.evidence,
      confidence: input.confidence,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as AssessmentQuestionEvaluation;
}

export async function listQuestionEvaluations(assignmentId: string, client?: SupabaseClient): Promise<AssessmentQuestionEvaluation[]> {
  const supabase = await resolveClient(client);
  const { data, error } = await supabase.from("assessment_question_evaluations").select("*").eq("assignment_id", assignmentId);
  if (error) throw error;
  return (data ?? []) as AssessmentQuestionEvaluation[];
}

export async function logAssessmentEvent(
  assignmentId: string,
  eventType: AssessmentEventType,
  metadata: Record<string, unknown> = {},
  client?: SupabaseClient
): Promise<void> {
  const supabase = await resolveClient(client);
  const { error } = await supabase.from("assessment_events").insert({ assignment_id: assignmentId, event_type: eventType, metadata });
  if (error) throw error;
}

export async function listAssessmentEvents(assignmentId: string, client?: SupabaseClient): Promise<AssessmentEvent[]> {
  const supabase = await resolveClient(client);
  const { data, error } = await supabase
    .from("assessment_events")
    .select("*")
    .eq("assignment_id", assignmentId)
    .order("event_timestamp", { ascending: true });
  if (error) throw error;
  return (data ?? []) as AssessmentEvent[];
}

export interface AssignmentStatCounts {
  assigned: number;
  submitted: number;
  pending: number;
  evaluated: number;
  shortlisted: number;
  needsReview: number;
}

/** Powers the recruiter job-page stat block (spec §23). "pending" = assigned
 * or started but not yet submitted; "evaluated" = reached a terminal
 * evaluated state (COMPLETED with a recommendation). */
export async function getAssignmentStatsForJob(jobId: string, client?: SupabaseClient): Promise<AssignmentStatCounts> {
  const supabase = await resolveClient(client);
  const { data, error } = await supabase
    .from("assessment_assignments")
    .select("status, recommendation, application:applications!inner(job_id)")
    .eq("application.job_id", jobId);
  if (error) throw error;

  const rows = (data ?? []) as unknown as { status: AssignmentStatus; recommendation: AssessmentRecommendation | null }[];

  return {
    assigned: rows.length,
    submitted: rows.filter((r) => ["SUBMITTED", "EVALUATING", "COMPLETED"].includes(r.status)).length,
    pending: rows.filter((r) => ["ASSIGNED", "STARTED"].includes(r.status)).length,
    evaluated: rows.filter((r) => r.status === "COMPLETED").length,
    shortlisted: rows.filter((r) => r.recommendation === "SHORTLIST").length,
    needsReview: rows.filter((r) => r.recommendation === "NEEDS_REVIEW").length,
  };
}

/** Used by the cron expiration sweep — service-role client only. */
export async function listExpirableAssignments(nowIso: string, client?: SupabaseClient): Promise<AssessmentAssignment[]> {
  const supabase = await resolveClient(client);
  const { data, error } = await supabase
    .from("assessment_assignments")
    .select("*")
    .lt("deadline", nowIso)
    .in("status", ["ASSIGNED", "STARTED"]);
  if (error) throw error;
  return (data ?? []) as AssessmentAssignment[];
}

/** Assignments whose deadline falls within [fromIso, toIso) and haven't
 * been submitted/expired/cancelled yet — the cron reminder sweep's source
 * query. Idempotency against sending twice is handled by
 * email_messages.idempotency_key (event_type "assessment.reminder_24h"),
 * not a separate reminder-sent column, since the reminder window is wide
 * enough that a single deadline only ever falls into it once per run.*/
export async function listAssignmentsNeedingReminder(fromIso: string, toIso: string, client?: SupabaseClient): Promise<AssessmentAssignment[]> {
  const supabase = await resolveClient(client);
  const { data, error } = await supabase
    .from("assessment_assignments")
    .select("*")
    .gte("deadline", fromIso)
    .lt("deadline", toIso)
    .in("status", ["ASSIGNED", "STARTED"]);
  if (error) throw error;
  return (data ?? []) as AssessmentAssignment[];
}
