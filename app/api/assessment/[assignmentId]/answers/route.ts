import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAssignment, upsertAnswer, logAssessmentEvent } from "@/lib/services/assessments";
import { isExpired } from "@/lib/assessment/logic";

/** Autosave endpoint — a route handler (not a Server Action) so it can be
 * called frequently on every debounced change without page navigation
 * overhead. Server-side persistence per spec §9: survives refresh/
 * disconnect since answers are never held only in client state. Relies on
 * the session-bound client so RLS ("Candidates can insert/update their own
 * answers") is the actual authorization boundary — the ownership check
 * below just turns an RLS-denied write into a clear 403 instead of a
 * generic Postgres error. */
export async function POST(request: Request, { params }: { params: Promise<{ assignmentId: string }> }) {
  const { assignmentId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const assignment = await getAssignment(assignmentId, supabase);
  if (!assignment) return NextResponse.json({ error: "Assignment not found." }, { status: 404 });

  if (["SUBMITTED", "EVALUATING", "COMPLETED", "EXPIRED", "CANCELLED"].includes(assignment.status)) {
    return NextResponse.json({ error: "This assessment is no longer accepting answers." }, { status: 409 });
  }
  if (isExpired(assignment.deadline)) {
    return NextResponse.json({ error: "The deadline for this assessment has passed." }, { status: 409 });
  }

  let body: { questionId?: string; answerText?: string | null; selectedOption?: string | null; code?: string | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Malformed JSON body." }, { status: 400 });
  }
  if (!body.questionId) return NextResponse.json({ error: "questionId is required." }, { status: 400 });

  const answer = await upsertAnswer(
    {
      assignmentId,
      questionId: body.questionId,
      answerText: body.answerText,
      selectedOption: body.selectedOption,
      code: body.code,
    },
    supabase
  );

  await logAssessmentEvent(assignmentId, "ANSWER_SAVED", { question_id: body.questionId }, supabase);

  return NextResponse.json({ autoSavedAt: answer.auto_saved_at });
}
