import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { linkCandidateAuth } from "@/lib/services/candidate-auth";

/** Exchanges the magic-link code for a session, then links the auth user to
 * their candidate profile (see lib/services/candidate-auth.ts). This is
 * Supabase's own hosted auth email, not app-built email automation — the
 * "no full email automation" constraint (spec §20) is about the
 * assessment.assigned notification, which Phase 7 owns. */
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
    return NextResponse.redirect(`${origin}/candidate/no-assessment`);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
