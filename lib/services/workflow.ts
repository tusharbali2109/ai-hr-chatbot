import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";
import type { WorkflowRun, WorkflowRunStatus, WorkflowStep, WorkflowSettings } from "@/lib/types/database";

async function resolveClient(client?: SupabaseClient): Promise<SupabaseClient> {
  if (client) return client;
  return (await createServerClient()) as unknown as SupabaseClient;
}

// ---------------------------------------------------------------------------
// workflow_runs / workflow_steps — the retry/resume ledger.
// ---------------------------------------------------------------------------

export async function getWorkflowRunForApplication(applicationId: string, client?: SupabaseClient): Promise<WorkflowRun | null> {
  const supabase = await resolveClient(client);
  const { data, error } = await supabase.from("workflow_runs").select("*").eq("application_id", applicationId).maybeSingle();
  if (error) throw error;
  return data as WorkflowRun | null;
}

export async function getOrCreateWorkflowRun(applicationId: string, currentStage: string, client?: SupabaseClient): Promise<WorkflowRun> {
  const supabase = await resolveClient(client);
  const existing = await getWorkflowRunForApplication(applicationId, supabase);
  if (existing) return existing;

  const { data, error } = await supabase
    .from("workflow_runs")
    .insert({ application_id: applicationId, status: "RUNNING", current_stage: currentStage, started_at: new Date().toISOString() })
    .select("*")
    .single();
  if (error) throw error;
  return data as WorkflowRun;
}

export async function updateWorkflowRun(
  id: string,
  fields: Partial<Pick<WorkflowRun, "status" | "current_stage" | "completed_at" | "error" | "metadata">>,
  client?: SupabaseClient
): Promise<void> {
  const supabase = await resolveClient(client);
  const { error } = await supabase.from("workflow_runs").update(fields).eq("id", id);
  if (error) throw error;
}

export async function createWorkflowStep(
  workflowRunId: string,
  agentType: string,
  eventType: string,
  client?: SupabaseClient
): Promise<WorkflowStep> {
  const supabase = await resolveClient(client);
  const { data, error } = await supabase
    .from("workflow_steps")
    .insert({ workflow_run_id: workflowRunId, agent_type: agentType, event_type: eventType, status: "RUNNING", started_at: new Date().toISOString() })
    .select("*")
    .single();
  if (error) throw error;
  return data as WorkflowStep;
}

export async function updateWorkflowStep(
  id: string,
  fields: Partial<Pick<WorkflowStep, "status" | "retry_count" | "completed_at" | "error" | "metadata">>,
  client?: SupabaseClient
): Promise<void> {
  const supabase = await resolveClient(client);
  const { error } = await supabase.from("workflow_steps").update(fields).eq("id", id);
  if (error) throw error;
}

export async function listWorkflowSteps(workflowRunId: string, client?: SupabaseClient): Promise<WorkflowStep[]> {
  const supabase = await resolveClient(client);
  const { data, error } = await supabase.from("workflow_steps").select("*").eq("workflow_run_id", workflowRunId).order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as WorkflowStep[];
}

export async function getLatestFailedStep(workflowRunId: string, client?: SupabaseClient): Promise<WorkflowStep | null> {
  const supabase = await resolveClient(client);
  const { data, error } = await supabase
    .from("workflow_steps")
    .select("*")
    .eq("workflow_run_id", workflowRunId)
    .eq("status", "FAILED")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as WorkflowStep | null;
}

export async function listWorkflowRunsByStatus(status: WorkflowRunStatus, limit = 200, client?: SupabaseClient): Promise<WorkflowRun[]> {
  const supabase = await resolveClient(client);
  const { data, error } = await supabase.from("workflow_runs").select("*").eq("status", status).order("updated_at", { ascending: false }).limit(limit);
  if (error) throw error;
  return (data ?? []) as WorkflowRun[];
}

// ---------------------------------------------------------------------------
// workflow_settings — job override, company default, or hard-coded fallback.
// ---------------------------------------------------------------------------

export const DEFAULT_WORKFLOW_SETTINGS: Omit<WorkflowSettings, "id" | "company_id" | "job_id" | "created_at" | "updated_at"> = {
  workflow_mode: "ASSISTED",
  ai_screening_enabled: true,
  ai_interview_enabled: true,
  assessment_enabled: true,
  auto_email_enabled: true,
  auto_scheduling_enabled: false,
  human_approval_required: true,
  final_decision_automation: false,
  scoring_weights: { screening: 25, interview: 35, assessment: 40 },
};

async function getCompanyDefaultSettings(companyId: string, client?: SupabaseClient): Promise<WorkflowSettings | null> {
  const supabase = await resolveClient(client);
  const { data, error } = await supabase.from("workflow_settings").select("*").eq("company_id", companyId).is("job_id", null).maybeSingle();
  if (error) throw error;
  return data as WorkflowSettings | null;
}

async function getJobSettings(jobId: string, client?: SupabaseClient): Promise<WorkflowSettings | null> {
  const supabase = await resolveClient(client);
  const { data, error } = await supabase.from("workflow_settings").select("*").eq("job_id", jobId).maybeSingle();
  if (error) throw error;
  return data as WorkflowSettings | null;
}

/** job override -> company default -> hard-coded fallback, in that order. */
export async function getEffectiveWorkflowSettings(companyId: string, jobId: string, client?: SupabaseClient): Promise<typeof DEFAULT_WORKFLOW_SETTINGS> {
  const supabase = await resolveClient(client);
  const jobSettings = await getJobSettings(jobId, supabase);
  if (jobSettings) return jobSettings;
  const companySettings = await getCompanyDefaultSettings(companyId, supabase);
  if (companySettings) return companySettings;
  return DEFAULT_WORKFLOW_SETTINGS;
}

export interface UpsertWorkflowSettingsInput {
  companyId: string;
  jobId: string | null;
  fields: Partial<Omit<WorkflowSettings, "id" | "company_id" | "job_id" | "created_at" | "updated_at">>;
}

export async function upsertWorkflowSettings(input: UpsertWorkflowSettingsInput, client?: SupabaseClient): Promise<WorkflowSettings> {
  const supabase = await resolveClient(client);
  const existing = input.jobId ? await getJobSettings(input.jobId, supabase) : await getCompanyDefaultSettings(input.companyId, supabase);

  if (existing) {
    const { data, error } = await supabase.from("workflow_settings").update(input.fields).eq("id", existing.id).select("*").single();
    if (error) throw error;
    return data as WorkflowSettings;
  }

  const { data, error } = await supabase
    .from("workflow_settings")
    .insert({ company_id: input.companyId, job_id: input.jobId, ...DEFAULT_WORKFLOW_SETTINGS, ...input.fields })
    .select("*")
    .single();
  if (error) throw error;
  return data as WorkflowSettings;
}
