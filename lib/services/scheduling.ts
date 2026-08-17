import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";
import type {
  Interviewer,
  CalendarConnection,
  CalendarConnectionSummary,
  OAuthState,
  CandidateAvailability,
  ScheduledInterview,
  ScheduledInterviewStatus,
  AutomationRule,
  AutomationRuleKey,
  WorkingHoursBlock,
} from "@/lib/types/database";

async function resolveClient(client?: SupabaseClient): Promise<SupabaseClient> {
  if (client) return client;
  return (await createServerClient()) as unknown as SupabaseClient;
}

// ---------------------------------------------------------------------------
// interviewers
// ---------------------------------------------------------------------------

export async function listInterviewersForCompany(client?: SupabaseClient): Promise<Interviewer[]> {
  const supabase = await resolveClient(client);
  const { data, error } = await supabase.from("interviewers").select("*").order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Interviewer[];
}

export async function getInterviewer(id: string, client?: SupabaseClient): Promise<Interviewer | null> {
  const supabase = await resolveClient(client);
  const { data, error } = await supabase.from("interviewers").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data as Interviewer | null;
}

/** Active interviewers qualified for a given interview type — the pool
 * auto-selection (spec §19/§20) picks from. Never returns an inactive
 * interviewer. */
export async function listQualifiedInterviewers(interviewType: string, client?: SupabaseClient): Promise<Interviewer[]> {
  const supabase = await resolveClient(client);
  const { data, error } = await supabase
    .from("interviewers")
    .select("*")
    .eq("active", true)
    .contains("interview_types", [interviewType]);
  if (error) throw error;
  return (data ?? []) as Interviewer[];
}

export interface CreateInterviewerInput {
  companyId: string;
  userId: string | null;
  name: string;
  email: string;
  timezone: string;
  interviewTypes: string[];
  workingHours: WorkingHoursBlock[];
}

export async function createInterviewer(input: CreateInterviewerInput, client?: SupabaseClient): Promise<Interviewer> {
  const supabase = await resolveClient(client);
  const { data, error } = await supabase
    .from("interviewers")
    .insert({
      company_id: input.companyId,
      user_id: input.userId,
      name: input.name,
      email: input.email,
      timezone: input.timezone,
      calendar_id: input.email,
      interview_types: input.interviewTypes,
      working_hours: input.workingHours,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as Interviewer;
}

export async function updateInterviewer(
  id: string,
  fields: Partial<Pick<Interviewer, "name" | "email" | "timezone" | "interview_types" | "working_hours" | "active">>,
  client?: SupabaseClient
): Promise<Interviewer> {
  const supabase = await resolveClient(client);
  const { data, error } = await supabase.from("interviewers").update(fields).eq("id", id).select("*").single();
  if (error) throw error;
  return data as Interviewer;
}

// ---------------------------------------------------------------------------
// calendar_connections — access_token/refresh_token are secrets. Only
// getCalendarConnectionWithSecrets (used exclusively by lib/scheduling's
// Google client) ever selects them; every other read uses the summary
// projection, matching job_board_credentials' discipline.
// ---------------------------------------------------------------------------

export async function getCalendarConnectionSummary(interviewerId: string, client?: SupabaseClient): Promise<CalendarConnectionSummary | null> {
  const supabase = await resolveClient(client);
  const { data, error } = await supabase
    .from("calendar_connections")
    .select("id, interviewer_id, status, connected_at, last_error")
    .eq("interviewer_id", interviewerId)
    .maybeSingle();
  if (error) throw error;
  return data as CalendarConnectionSummary | null;
}

export async function listCalendarConnectionSummariesForCompany(client?: SupabaseClient): Promise<CalendarConnectionSummary[]> {
  const supabase = await resolveClient(client);
  const { data, error } = await supabase.from("calendar_connections").select("id, interviewer_id, status, connected_at, last_error");
  if (error) throw error;
  return (data ?? []) as CalendarConnectionSummary[];
}

/** Server-only — never call this from a path that forwards the result to
 * the browser. Used exclusively by lib/scheduling/google-client.ts. */
export async function getCalendarConnectionWithSecrets(interviewerId: string, client?: SupabaseClient): Promise<CalendarConnection | null> {
  const supabase = await resolveClient(client);
  const { data, error } = await supabase.from("calendar_connections").select("*").eq("interviewer_id", interviewerId).maybeSingle();
  if (error) throw error;
  return data as CalendarConnection | null;
}

export interface UpsertCalendarConnectionInput {
  interviewerId: string;
  companyId: string;
  accessToken: string;
  refreshToken: string | null;
  tokenExpiresAt: string;
  scope: string;
}

export async function upsertCalendarConnectionTokens(input: UpsertCalendarConnectionInput, client?: SupabaseClient): Promise<void> {
  const supabase = await resolveClient(client);
  const { error } = await supabase.from("calendar_connections").upsert(
    {
      interviewer_id: input.interviewerId,
      company_id: input.companyId,
      status: "connected",
      access_token: input.accessToken,
      // A refresh token is only issued on the first consent grant — never
      // overwrite an existing one with null on a later token refresh.
      ...(input.refreshToken ? { refresh_token: input.refreshToken } : {}),
      token_expires_at: input.tokenExpiresAt,
      scope: input.scope,
      connected_at: new Date().toISOString(),
      last_error: null,
    },
    { onConflict: "interviewer_id" }
  );
  if (error) throw error;
}

export async function markCalendarConnectionError(interviewerId: string, message: string, client?: SupabaseClient): Promise<void> {
  const supabase = await resolveClient(client);
  const { error } = await supabase
    .from("calendar_connections")
    .upsert({ interviewer_id: interviewerId, status: "error", last_error: message }, { onConflict: "interviewer_id" });
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// oauth_states
// ---------------------------------------------------------------------------

export async function createOAuthState(
  input: { state: string; interviewerId: string; companyId: string; expiresAt: string },
  client?: SupabaseClient
): Promise<void> {
  const supabase = await resolveClient(client);
  const { error } = await supabase.from("oauth_states").insert({
    state: input.state,
    interviewer_id: input.interviewerId,
    company_id: input.companyId,
    expires_at: input.expiresAt,
  });
  if (error) throw error;
}

/** Validates + deletes in one round trip — a state can only ever be
 * consumed once (CSRF guard). */
export async function consumeOAuthState(state: string, client?: SupabaseClient): Promise<OAuthState | null> {
  const supabase = await resolveClient(client);
  const { data, error } = await supabase.from("oauth_states").select("*").eq("state", state).maybeSingle();
  if (error) throw error;
  if (!data) return null;

  await supabase.from("oauth_states").delete().eq("state", state);

  if (new Date(data.expires_at as string).getTime() < Date.now()) return null;
  return data as OAuthState;
}

// ---------------------------------------------------------------------------
// candidate_availability
// ---------------------------------------------------------------------------

export async function listAvailabilityForApplication(applicationId: string, client?: SupabaseClient): Promise<CandidateAvailability[]> {
  const supabase = await resolveClient(client);
  const { data, error } = await supabase.from("candidate_availability").select("*").eq("application_id", applicationId);
  if (error) throw error;
  return (data ?? []) as CandidateAvailability[];
}

export interface AvailabilityBlockInput {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  timezone: string;
}

/** Full replace, not merge — the recruiter re-enters the candidate's
 * complete weekly availability each time rather than diffing individual
 * blocks. */
export async function replaceAvailabilityForApplication(
  applicationId: string,
  blocks: AvailabilityBlockInput[],
  client?: SupabaseClient
): Promise<void> {
  const supabase = await resolveClient(client);
  const { error: deleteError } = await supabase.from("candidate_availability").delete().eq("application_id", applicationId);
  if (deleteError) throw deleteError;

  if (blocks.length === 0) return;
  const { error: insertError } = await supabase.from("candidate_availability").insert(
    blocks.map((b) => ({
      application_id: applicationId,
      day_of_week: b.dayOfWeek,
      start_time: b.startTime,
      end_time: b.endTime,
      timezone: b.timezone,
    }))
  );
  if (insertError) throw insertError;
}

// ---------------------------------------------------------------------------
// scheduled_interviews
// ---------------------------------------------------------------------------

export interface CreateScheduledInterviewInput {
  applicationId: string;
  candidateId: string;
  interviewerId: string;
  interviewType: string;
  provider: string;
  externalEventId: string | null;
  startTime: string;
  endTime: string;
  timezone: string;
  status: ScheduledInterviewStatus;
  meetingUrl: string | null;
  rescheduledFromId?: string | null;
}

export async function createScheduledInterview(input: CreateScheduledInterviewInput, client?: SupabaseClient): Promise<ScheduledInterview> {
  const supabase = await resolveClient(client);
  const { data, error } = await supabase
    .from("scheduled_interviews")
    .insert({
      application_id: input.applicationId,
      candidate_id: input.candidateId,
      interviewer_id: input.interviewerId,
      interview_type: input.interviewType,
      provider: input.provider,
      external_event_id: input.externalEventId,
      start_time: input.startTime,
      end_time: input.endTime,
      timezone: input.timezone,
      status: input.status,
      meeting_url: input.meetingUrl,
      rescheduled_from_id: input.rescheduledFromId ?? null,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as ScheduledInterview;
}

export async function getScheduledInterview(id: string, client?: SupabaseClient): Promise<ScheduledInterview | null> {
  const supabase = await resolveClient(client);
  const { data, error } = await supabase.from("scheduled_interviews").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data as ScheduledInterview | null;
}

/** Most recent non-cancelled/non-rescheduled-away booking for an
 * application — what the candidate detail page shows as "the" interview. */
export async function getCurrentScheduledInterviewForApplication(applicationId: string, client?: SupabaseClient): Promise<ScheduledInterview | null> {
  const supabase = await resolveClient(client);
  const { data, error } = await supabase
    .from("scheduled_interviews")
    .select("*")
    .eq("application_id", applicationId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as ScheduledInterview | null;
}

/** Powers the Communications Center's Calendar/Interviews/Reminders tabs —
 * company-scoped via RLS, most recent first. */
export async function listScheduledInterviewsForCompany(client?: SupabaseClient): Promise<ScheduledInterview[]> {
  const supabase = await resolveClient(client);
  const { data, error } = await supabase.from("scheduled_interviews").select("*").order("start_time", { ascending: false }).limit(200);
  if (error) throw error;
  return (data ?? []) as ScheduledInterview[];
}

export async function listScheduledInterviewsForApplication(applicationId: string, client?: SupabaseClient): Promise<ScheduledInterview[]> {
  const supabase = await resolveClient(client);
  const { data, error } = await supabase
    .from("scheduled_interviews")
    .select("*")
    .eq("application_id", applicationId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as ScheduledInterview[];
}

export async function updateScheduledInterview(
  id: string,
  fields: Partial<
    Pick<
      ScheduledInterview,
      "status" | "external_event_id" | "meeting_url" | "cancelled_by" | "cancellation_reason" | "reminder_24h_sent_at" | "reminder_2h_sent_at"
    >
  >,
  client?: SupabaseClient
): Promise<void> {
  const supabase = await resolveClient(client);
  const { error } = await supabase.from("scheduled_interviews").update(fields).eq("id", id);
  if (error) throw error;
}

/** Interviewer workload counters (spec §20) — today and this week, only
 * counting bookings that still occupy the interviewer's time. */
export async function countInterviewerBookings(interviewerId: string, sinceIso: string, untilIso: string, client?: SupabaseClient): Promise<number> {
  const supabase = await resolveClient(client);
  const { count, error } = await supabase
    .from("scheduled_interviews")
    .select("id", { count: "exact", head: true })
    .eq("interviewer_id", interviewerId)
    .in("status", ["PROPOSED", "CONFIRMED"])
    .gte("start_time", sinceIso)
    .lt("start_time", untilIso);
  if (error) throw error;
  return count ?? 0;
}

/** Confirmed interviews whose start_time falls within [from, to) and whose
 * reminder column for this window is still unset — the cron reminder sweep's
 * source query. */
export async function listConfirmedInterviewsNeedingReminder(
  window: "24h" | "2h",
  fromIso: string,
  toIso: string,
  client?: SupabaseClient
): Promise<ScheduledInterview[]> {
  const supabase = await resolveClient(client);
  const column = window === "24h" ? "reminder_24h_sent_at" : "reminder_2h_sent_at";
  const { data, error } = await supabase
    .from("scheduled_interviews")
    .select("*")
    .eq("status", "CONFIRMED")
    .is(column, null)
    .gte("start_time", fromIso)
    .lt("start_time", toIso);
  if (error) throw error;
  return (data ?? []) as ScheduledInterview[];
}

// ---------------------------------------------------------------------------
// interview_slot_locks — via the security-definer RPC functions in the
// migration, since PostgREST can't run the atomic check-and-insert as a
// multi-statement client transaction.
// ---------------------------------------------------------------------------

/** Returns the lock id on success, or null if the interval is already held
 * (spec §12/§13's double-booking guard). */
export async function acquireSchedulingLock(
  interviewerId: string,
  startTime: string,
  endTime: string,
  ttlSeconds = 60,
  client?: SupabaseClient
): Promise<string | null> {
  const supabase = await resolveClient(client);
  const { data, error } = await supabase.rpc("acquire_scheduling_lock", {
    p_interviewer_id: interviewerId,
    p_start: startTime,
    p_end: endTime,
    p_ttl_seconds: ttlSeconds,
  });
  if (error) throw error;
  return (data as string | null) ?? null;
}

export async function releaseSchedulingLock(lockId: string, client?: SupabaseClient): Promise<void> {
  const supabase = await resolveClient(client);
  const { error } = await supabase.rpc("release_scheduling_lock", { p_lock_id: lockId });
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// automation_rules
// ---------------------------------------------------------------------------

/** companyId is always required explicitly (not left to RLS alone) — a
 * service-role client (used from the assessment-submit route, which has no
 * recruiter session) bypasses RLS entirely, so relying on
 * `current_company_id()` there would silently return every company's rules. */
export async function listAutomationRulesForCompany(companyId: string, client?: SupabaseClient): Promise<AutomationRule[]> {
  const supabase = await resolveClient(client);
  const { data, error } = await supabase.from("automation_rules").select("*").eq("company_id", companyId);
  if (error) throw error;
  return (data ?? []) as AutomationRule[];
}

export async function upsertAutomationRule(
  companyId: string,
  ruleKey: AutomationRuleKey,
  enabled: boolean,
  config: Record<string, unknown> = {},
  client?: SupabaseClient
): Promise<AutomationRule> {
  const supabase = await resolveClient(client);
  const { data, error } = await supabase
    .from("automation_rules")
    .upsert({ company_id: companyId, rule_key: ruleKey, enabled, config }, { onConflict: "company_id,rule_key" })
    .select("*")
    .single();
  if (error) throw error;
  return data as AutomationRule;
}
