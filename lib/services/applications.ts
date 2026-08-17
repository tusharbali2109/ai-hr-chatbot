import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";
import type { Application, Candidate, Job, StageHistory, DecisionSource } from "@/lib/types/database";
import type { RecruitmentStage } from "@/lib/stages";

const DECISION_SOURCES = new Set(["AI", "HUMAN", "SYSTEM", "CANDIDATE"]);

/** Optional client param — the Twilio webhook routes run with no user
 * session and must pass the service-role client from
 * lib/supabase/webhook-client.ts explicitly, exactly like
 * lib/services/agent-runs.ts and lib/services/ingestion.ts already support. */
async function createClient(client?: SupabaseClient): Promise<SupabaseClient> {
  if (client) return client;
  return (await createServerClient()) as unknown as SupabaseClient;
}

export interface ApplicationWithRelations extends Application {
  candidate: Pick<Candidate, "id" | "name" | "email">;
  job: Pick<Job, "id" | "title">;
}

export async function listApplications(): Promise<ApplicationWithRelations[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("applications")
    .select("*, candidate:candidates(id, name, email), job:jobs(id, title)")
    .order("applied_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as unknown as ApplicationWithRelations[];
}

export async function listApplicationsForJob(jobId: string): Promise<ApplicationWithRelations[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("applications")
    .select("*, candidate:candidates(id, name, email), job:jobs(id, title)")
    .eq("job_id", jobId)
    .order("applied_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as unknown as ApplicationWithRelations[];
}

export async function listStageHistory(applicationId: string): Promise<StageHistory[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("stage_history")
    .select("*")
    .eq("application_id", applicationId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (data ?? []) as StageHistory[];
}

export async function updateApplicationStage(
  applicationId: string,
  fromStage: RecruitmentStage,
  toStage: RecruitmentStage,
  reason?: string,
  metadata?: Record<string, unknown>,
  client?: SupabaseClient
) {
  const supabase = await createClient(client);

  const { error: updateError } = await supabase
    .from("applications")
    .update({ current_stage: toStage })
    .eq("id", applicationId);

  if (updateError) throw updateError;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Every existing agent already tags its stage-history metadata with a
  // decision_source key (AI/HUMAN) — this promotes that into the real
  // Phase 8 column (added in 0008) without requiring any existing call
  // site to change. New Phase 8 call sites (StageTransitionService) pass
  // it as an explicit metadata key too, for the same reason.
  const rawDecisionSource = metadata?.decision_source;
  const decisionSource: DecisionSource | null =
    typeof rawDecisionSource === "string" && DECISION_SOURCES.has(rawDecisionSource) ? (rawDecisionSource as DecisionSource) : null;

  const { error: historyError } = await supabase.from("stage_history").insert({
    application_id: applicationId,
    from_stage: fromStage,
    to_stage: toStage,
    changed_by: user?.id ?? null,
    reason: reason ?? null,
    metadata: metadata ?? null,
    decision_source: decisionSource,
  });

  if (historyError) throw historyError;
}

export async function updateApplicationScore(applicationId: string, overallScore: number, client?: SupabaseClient): Promise<void> {
  const supabase = await createClient(client);
  const { error } = await supabase.from("applications").update({ overall_score: overallScore }).eq("id", applicationId);
  if (error) throw error;
}

export async function getApplication(applicationId: string, client?: SupabaseClient): Promise<Application | null> {
  const supabase = await createClient(client);
  const { data, error } = await supabase.from("applications").select("*").eq("id", applicationId).maybeSingle();
  if (error) throw error;
  return data as Application | null;
}
