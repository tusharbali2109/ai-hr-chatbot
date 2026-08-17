import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";
import type { Application, Candidate } from "@/lib/types/database";
import {
  normalizeIngestPayload,
  matchCandidate,
  decideApplicationOutcome,
  type CandidateMatchCandidate,
  type NormalizedApplicant,
  type RawApplicantPayload,
} from "@/lib/ingestion/logic";

/**
 * Every function here accepts an optional Supabase client. Sync (triggered
 * by an authenticated recruiter clicking "Sync Now") omits it and gets the
 * normal session-bound, RLS-enforcing client. The webhook route (no
 * session) passes the dedicated service-role client from
 * lib/supabase/webhook-client.ts explicitly. Either way the same ingestion
 * logic runs — only who's allowed to write differs.
 */
async function resolveClient(client?: SupabaseClient): Promise<SupabaseClient> {
  if (client) return client;
  return (await createServerClient()) as unknown as SupabaseClient;
}

/** candidates is a global table (see 0001_init.sql) — matches are looked up
 * across all companies, consistent with that existing design. */
export async function findCandidateMatches(
  normalizedEmail: string,
  normalizedPhone: string | null,
  client?: SupabaseClient
): Promise<CandidateMatchCandidate[]> {
  const supabase = await resolveClient(client);

  const orFilters = [`email.eq.${normalizedEmail}`];
  if (normalizedPhone) orFilters.push(`phone.eq.${normalizedPhone}`);

  const { data, error } = await supabase.from("candidates").select("id, email, phone").or(orFilters.join(","));
  if (error) throw error;

  return (data ?? []).map((c) => ({ id: c.id as string, email: c.email as string, phone: (c.phone as string | null) ?? null }));
}

export async function upsertCandidate(
  candidateId: string | null,
  applicant: NormalizedApplicant,
  client?: SupabaseClient
): Promise<Candidate> {
  const supabase = await resolveClient(client);

  if (candidateId) {
    const { data, error } = await supabase
      .from("candidates")
      .update({
        name: applicant.name,
        phone: applicant.phone,
        location: applicant.location,
        resume_url: applicant.resume_url,
        linkedin_url: applicant.linkedin_url,
        portfolio_url: applicant.portfolio_url,
      })
      .eq("id", candidateId)
      .select("*")
      .single();
    if (error) throw error;
    return data as Candidate;
  }

  const { data, error } = await supabase
    .from("candidates")
    .insert({
      name: applicant.name,
      email: applicant.email,
      phone: applicant.phone,
      location: applicant.location,
      resume_url: applicant.resume_url,
      linkedin_url: applicant.linkedin_url,
      portfolio_url: applicant.portfolio_url,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as Candidate;
}

export async function findExistingApplication(
  candidateId: string,
  jobId: string,
  client?: SupabaseClient
): Promise<Application | null> {
  const supabase = await resolveClient(client);
  const { data, error } = await supabase
    .from("applications")
    .select("*")
    .eq("candidate_id", candidateId)
    .eq("job_id", jobId)
    .maybeSingle();
  if (error) throw error;
  return data as Application | null;
}

export async function createApplication(
  candidateId: string,
  jobId: string,
  applicant: NormalizedApplicant,
  client?: SupabaseClient
): Promise<Application> {
  const supabase = await resolveClient(client);
  const { data, error } = await supabase
    .from("applications")
    .insert({
      candidate_id: candidateId,
      job_id: jobId,
      current_stage: "APPLIED",
      source: applicant.source,
      source_platform: applicant.source_platform,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as Application;
}

/** There is no "SYSTEM" user row — changed_by stays null and the actor is
 * carried in metadata instead of inventing a fake user id. */
export async function recordApplicationReceivedStageHistory(
  applicationId: string,
  platform: string,
  client?: SupabaseClient
): Promise<void> {
  const supabase = await resolveClient(client);
  const { error } = await supabase.from("stage_history").insert({
    application_id: applicationId,
    from_stage: null,
    to_stage: "APPLIED",
    changed_by: null,
    reason: "Candidate application received",
    metadata: { source: "ingestion", platform },
  });
  if (error) throw error;
}

export async function flagPotentialDuplicate(
  candidateId: string,
  possibleMatchCandidateId: string,
  applicationId: string,
  matchSignal: string,
  client?: SupabaseClient
): Promise<void> {
  const supabase = await resolveClient(client);
  const { error } = await supabase.from("candidate_duplicate_flags").insert({
    candidate_id: candidateId,
    possible_match_candidate_id: possibleMatchCandidateId,
    application_id: applicationId,
    match_signal: matchSignal,
    status: "pending",
  });
  if (error) throw error;
}

export async function logInternalEvent(
  eventType: string,
  fields: { application_id?: string; candidate_id?: string; job_id?: string; payload?: Record<string, unknown> },
  client?: SupabaseClient
): Promise<void> {
  const supabase = await resolveClient(client);
  const { error } = await supabase.from("internal_events").insert({
    event_type: eventType,
    application_id: fields.application_id ?? null,
    candidate_id: fields.candidate_id ?? null,
    job_id: fields.job_id ?? null,
    payload: fields.payload ?? {},
  });
  if (error) throw error;
}

export type IngestOutcome = "created" | "noop" | "skipped_no_email";

export interface IngestResult {
  outcome: IngestOutcome;
  candidateId: string | null;
  applicationId: string | null;
}

/**
 * The full ingestion pipeline: normalize -> find/create candidate -> find/create
 * application -> stage history -> internal event. Shared by both the webhook
 * route and the sync service so there is exactly one place this logic lives.
 */
export async function ingestApplicant(
  raw: RawApplicantPayload,
  platform: string,
  jobId: string,
  client?: SupabaseClient
): Promise<IngestResult> {
  const applicant = normalizeIngestPayload(raw, platform);

  if (!applicant.email) {
    return { outcome: "skipped_no_email", candidateId: null, applicationId: null };
  }

  const candidates: CandidateMatchCandidate[] = await findCandidateMatches(applicant.email, applicant.phone, client);
  const match = matchCandidate({ email: applicant.email, phone: applicant.phone }, candidates);

  // Only a confident exact-email match merges into the existing candidate
  // row. An uncertain (phone-only) match never auto-merges — a new
  // candidate row is created instead and flagged for manual review.
  const confidentMatchId = match.type === "exact_email" ? match.candidateId : null;
  const candidate = await upsertCandidate(confidentMatchId, applicant, client);

  const existingApplication = await findExistingApplication(candidate.id, jobId, client);
  const outcome = decideApplicationOutcome(Boolean(existingApplication));

  if (outcome === "noop") {
    return { outcome: "noop", candidateId: candidate.id, applicationId: existingApplication!.id };
  }

  const application = await createApplication(candidate.id, jobId, applicant, client);
  await recordApplicationReceivedStageHistory(application.id, platform, client);

  if (match.needsReview && match.candidateId) {
    await flagPotentialDuplicate(candidate.id, match.candidateId, application.id, match.type, client);
  }

  await logInternalEvent(
    "candidate.application.created",
    {
      application_id: application.id,
      candidate_id: candidate.id,
      job_id: jobId,
      payload: { source: applicant.source, source_platform: applicant.source_platform },
    },
    client
  );

  return { outcome: "created", candidateId: candidate.id, applicationId: application.id };
}
