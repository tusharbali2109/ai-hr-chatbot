import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";
import type { Candidate } from "@/lib/types/database";

async function resolveClient(client?: SupabaseClient): Promise<SupabaseClient> {
  if (client) return client;
  return (await createServerClient()) as unknown as SupabaseClient;
}

export type LinkCandidateAuthResult =
  | { outcome: "linked"; candidate: Candidate }
  | { outcome: "already_linked"; candidate: Candidate }
  | { outcome: "no_assessment_for_email" };

/**
 * Links the just-authenticated Supabase auth user to a `candidates` row by
 * matching email (case-insensitive), but ONLY when that candidate already
 * has at least one assessment assignment — this prevents an arbitrary
 * magic-link signup from linking to (and thereby gaining read access to)
 * an unrelated candidate's profile. Idempotent: a second login for an
 * already-linked candidate just verifies the match.
 */
export async function linkCandidateAuth(authUserId: string, authEmail: string, client?: SupabaseClient): Promise<LinkCandidateAuthResult> {
  const supabase = await resolveClient(client);

  const { data: existingLink, error: existingLinkError } = await supabase
    .from("candidates")
    .select("*")
    .eq("auth_user_id", authUserId)
    .maybeSingle();
  if (existingLinkError) throw existingLinkError;
  if (existingLink) return { outcome: "already_linked", candidate: existingLink as Candidate };

  // RLS (see migration 0006) only lets this SELECT see a candidate row when
  // it's unlinked, the email matches this session, AND it already has at
  // least one assessment assignment — so a non-null result here already
  // proves eligibility; no separate application-layer count query needed
  // (one would hit the same RLS gate anyway before linking is complete).
  const { data: candidate, error: candidateError } = await supabase
    .from("candidates")
    .select("*")
    .ilike("email", authEmail)
    .is("auth_user_id", null)
    .maybeSingle();
  if (candidateError) throw candidateError;
  if (!candidate) return { outcome: "no_assessment_for_email" };

  const { data: linked, error: linkError } = await supabase
    .from("candidates")
    .update({ auth_user_id: authUserId })
    .eq("id", candidate.id)
    .select("*")
    .single();
  if (linkError) throw linkError;

  return { outcome: "linked", candidate: linked as Candidate };
}

/**
 * Distinguishes a candidate whose ONLY reason for portal access is a
 * browser video interview from one who also has an assessment or digital
 * workday assignment. Used by the auth callback to decide whether to lock
 * the candidate into /candidate/video-interview only (see proxy.ts) or let
 * them land on the normal /candidate hub with all three activities.
 *
 * Deliberately re-checks with the caller's own (candidate-scoped) client so
 * this only ever sees rows RLS already allows — same trust boundary as
 * everything else here, no service-role escalation needed.
 */
export async function candidateHasNonInterviewAssignment(candidateId: string, client?: SupabaseClient): Promise<boolean> {
  const supabase = await resolveClient(client);

  const [{ count: assessmentCount, error: assessmentError }, { count: workdayCount, error: workdayError }] = await Promise.all([
    supabase.from("assessment_assignments").select("id", { count: "exact", head: true }).eq("candidate_id", candidateId),
    supabase.from("workday_assignments").select("id", { count: "exact", head: true }).eq("candidate_id", candidateId),
  ]);
  if (assessmentError) throw assessmentError;
  if (workdayError) throw workdayError;

  return (assessmentCount ?? 0) > 0 || (workdayCount ?? 0) > 0;
}

/**
 * Looks up the most recent rejected sign-in attempt for a candidate's email
 * (see candidate_login_attempts, migration 0013) — used on the recruiter's
 * candidate detail page to surface "candidate tried to log in but wasn't
 * eligible yet" as a low-key signal, not an error state.
 */
export async function getLatestLoginAttempt(email: string, client?: SupabaseClient): Promise<{ attemptedAt: string } | null> {
  const supabase = await resolveClient(client);

  const { data, error } = await supabase
    .from("candidate_login_attempts")
    .select("attempted_at")
    .ilike("email", email)
    .order("attempted_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  return { attemptedAt: data.attempted_at as string };
}
