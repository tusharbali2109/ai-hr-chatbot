import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { linkCandidateAuth, candidateHasNonInterviewAssignment } from "@/lib/services/candidate-auth";

/** Exchanges the Google OAuth code for a session, then links the auth user
 * to their candidate profile (see lib/services/candidate-auth.ts). This is
 * Supabase's own hosted OAuth flow, not app-built email automation — the
 * "no full email automation" constraint (spec §20) is about the
 * assessment.assigned notification, which Phase 7 owns.
 *
 * linkCandidateAuth() only succeeds (via RLS's candidate_has_assignment()
 * check) when the signed-in email matches a candidate who already has an
 * assessment assignment, a workday assignment, or a browser video interview
 * — i.e. a recruiter has actually moved them into an eligible stage. No
 * separate "approved" flag/table exists; that stage-based gate IS the
 * approval. Anyone else lands on /candidate/pending-approval.
 *
 * A candidate whose ONLY eligibility is the video interview (no assessment
 * or workday assignment) is sent straight to /candidate/video-interview and
 * is then locked to that single route by proxy.ts, via the
 * `candidate_track` cookie set below — a candidate who also has an
 * assessment/workday assignment keeps normal access to the full /candidate
 * hub, unchanged from before.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/candidate";

  if (!code) {
    return NextResponse.redirect(`${origin}/candidate/login?error=missing_code`);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user?.email) {
    return NextResponse.redirect(`${origin}/candidate/login?error=invalid_link`);
  }

  const result = await linkCandidateAuth(data.user.id, data.user.email);
  if (result.outcome === "no_assessment_for_email") {
    return NextResponse.redirect(`${origin}/candidate/pending-approval`);
  }

  const hasOtherAssignment = await candidateHasNonInterviewAssignment(result.candidate.id, supabase);

  const destination = hasOtherAssignment ? next : "/candidate/video-interview";
  const response = NextResponse.redirect(`${origin}${destination}`);

  // Read by proxy.ts to restrict interview-only candidates to
  // /candidate/video-interview* and nothing else under /candidate/*.
  response.cookies.set("candidate_track", hasOtherAssignment ? "full" : "interview_only", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/candidate",
  });

  return response;
}
