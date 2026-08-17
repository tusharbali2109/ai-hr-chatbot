import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAssignment, upsertAnswer, logAssessmentEvent } from "@/lib/services/assessments";
import { isExpired } from "@/lib/assessment/logic";

const MAX_FILE_BYTES = 10 * 1024 * 1024;

/** FILE_UPLOAD answers go to the private `assessment-uploads` bucket under
 * `{assignmentId}/{questionId}/{filename}` — storage.objects RLS (migration
 * 0006) only lets the candidate write under their own assignment id, so
 * this route just needs to confirm the assignment is still open before
 * uploading through the same session-bound client. */
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

  const formData = await request.formData();
  const questionId = formData.get("questionId");
  const file = formData.get("file");
  if (typeof questionId !== "string" || !(file instanceof File)) {
    return NextResponse.json({ error: "questionId and file are required." }, { status: 400 });
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json({ error: "File exceeds the 10MB limit." }, { status: 413 });
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${assignmentId}/${questionId}/${Date.now()}_${safeName}`;

  const { error: uploadError } = await supabase.storage.from("assessment-uploads").upload(path, file, { upsert: true });
  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 });

  const answer = await upsertAnswer({ assignmentId, questionId, fileUrl: path }, supabase);
  await logAssessmentEvent(assignmentId, "ANSWER_SAVED", { question_id: questionId, file: true }, supabase);

  return NextResponse.json({ autoSavedAt: answer.auto_saved_at, path });
}
