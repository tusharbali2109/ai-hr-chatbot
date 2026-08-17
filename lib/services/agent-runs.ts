import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";
import type { AgentRun, AgentType, AgentRunStatus } from "@/lib/types/database";

/** Generic run-tracking for any AI agent (Phase 4 only registers 'SCREENING';
 * future agents extend agent_runs.agent_type in their own migration). */
async function resolveClient(client?: SupabaseClient): Promise<SupabaseClient> {
  if (client) return client;
  return (await createServerClient()) as unknown as SupabaseClient;
}

export async function hasActiveRun(agentType: AgentType, applicationId: string, client?: SupabaseClient): Promise<boolean> {
  const supabase = await resolveClient(client);
  const { data, error } = await supabase
    .from("agent_runs")
    .select("id")
    .eq("agent_type", agentType)
    .eq("application_id", applicationId)
    .in("status", ["QUEUED", "RUNNING"])
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

export async function createAgentRun(agentType: AgentType, applicationId: string, client?: SupabaseClient): Promise<AgentRun> {
  const supabase = await resolveClient(client);
  const { data, error } = await supabase
    .from("agent_runs")
    .insert({ agent_type: agentType, application_id: applicationId, status: "QUEUED" })
    .select("*")
    .single();
  if (error) throw error;
  return data as AgentRun;
}

/** ASSESSMENT_GENERATION is job-level, not application-level — an
 * assessment isn't tied to one candidate's application. Everything else
 * (guard/run lifecycle) is identical to the application-scoped functions
 * above. */
export async function hasActiveJobRun(agentType: AgentType, jobId: string, client?: SupabaseClient): Promise<boolean> {
  const supabase = await resolveClient(client);
  const { data, error } = await supabase
    .from("agent_runs")
    .select("id")
    .eq("agent_type", agentType)
    .eq("job_id", jobId)
    .in("status", ["QUEUED", "RUNNING"])
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

export async function createJobAgentRun(agentType: AgentType, jobId: string, client?: SupabaseClient): Promise<AgentRun> {
  const supabase = await resolveClient(client);
  const { data, error } = await supabase
    .from("agent_runs")
    .insert({ agent_type: agentType, job_id: jobId, status: "QUEUED" })
    .select("*")
    .single();
  if (error) throw error;
  return data as AgentRun;
}

export async function markAgentRunRunning(id: string, model: string, client?: SupabaseClient): Promise<void> {
  const supabase = await resolveClient(client);
  const { error } = await supabase
    .from("agent_runs")
    .update({ status: "RUNNING" as AgentRunStatus, started_at: new Date().toISOString(), model })
    .eq("id", id);
  if (error) throw error;
}

export async function markAgentRunCompleted(id: string, metadata: Record<string, unknown> = {}, client?: SupabaseClient): Promise<void> {
  const supabase = await resolveClient(client);
  const { error } = await supabase
    .from("agent_runs")
    .update({ status: "COMPLETED" as AgentRunStatus, completed_at: new Date().toISOString(), metadata })
    .eq("id", id);
  if (error) throw error;
}

export async function markAgentRunFailed(id: string, errorMessage: string, client?: SupabaseClient): Promise<void> {
  const supabase = await resolveClient(client);
  const { error } = await supabase
    .from("agent_runs")
    .update({ status: "FAILED" as AgentRunStatus, completed_at: new Date().toISOString(), error: errorMessage })
    .eq("id", id);
  if (error) throw error;
}

/** Powers the "Screening Agent" card on the AI Agents page with real state. */
export async function getScreeningAgentSummary(client?: SupabaseClient): Promise<{
  lastRun: AgentRun | null;
  runsLast24h: number;
}> {
  const supabase = await resolveClient(client);

  const { data: lastRun, error: lastRunError } = await supabase
    .from("agent_runs")
    .select("*")
    .eq("agent_type", "SCREENING")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (lastRunError) throw lastRunError;

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count, error: countError } = await supabase
    .from("agent_runs")
    .select("id", { count: "exact", head: true })
    .eq("agent_type", "SCREENING")
    .gte("created_at", since);
  if (countError) throw countError;

  return { lastRun: (lastRun as AgentRun | null) ?? null, runsLast24h: count ?? 0 };
}
