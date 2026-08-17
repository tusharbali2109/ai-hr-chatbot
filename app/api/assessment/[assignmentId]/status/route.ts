import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAssignment } from "@/lib/services/assessments";

/** Polled every ~30s by the candidate portal's timer so it never trusts
 * only client-side JavaScript for the countdown (spec §10) — this is the
 * server-truth reconciliation point. */
export async function GET(_request: Request, { params }: { params: Promise<{ assignmentId: string }> }) {
  const { assignmentId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const assignment = await getAssignment(assignmentId, supabase);
  if (!assignment) return NextResponse.json({ error: "Assignment not found." }, { status: 404 });

  return NextResponse.json({
    status: assignment.status,
    deadline: assignment.deadline,
    serverNow: new Date().toISOString(),
  });
}
