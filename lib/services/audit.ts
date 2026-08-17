import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";
import type { AuditActorType, AuditLogEntry } from "@/lib/types/database";

async function resolveClient(client?: SupabaseClient): Promise<SupabaseClient> {
  if (client) return client;
  return (await createServerClient()) as unknown as SupabaseClient;
}

export interface RecordAuditEventInput {
  companyId: string;
  actorId: string | null;
  actorType: AuditActorType;
  action: string;
  entityType: string;
  entityId: string | null;
  oldValue?: Record<string, unknown> | null;
  newValue?: Record<string, unknown> | null;
  reason?: string | null;
}

/** Covers the NEW Phase 8 decision points only (final review, approval,
 * override, offer approval, workflow-config change) — existing per-domain
 * history (stage_history/assessment_events/interview_events/agent_runs)
 * already covers everything else; the "complete audit trail" is the union. */
export async function recordAuditEvent(input: RecordAuditEventInput, client?: SupabaseClient): Promise<void> {
  const supabase = await resolveClient(client);
  const { error } = await supabase.from("audit_log").insert({
    company_id: input.companyId,
    actor_id: input.actorId,
    actor_type: input.actorType,
    action: input.action,
    entity_type: input.entityType,
    entity_id: input.entityId,
    old_value: input.oldValue ?? null,
    new_value: input.newValue ?? null,
    reason: input.reason ?? null,
  });
  if (error) throw error;
}

export async function listAuditLogForCompany(limit = 200, client?: SupabaseClient): Promise<AuditLogEntry[]> {
  const supabase = await resolveClient(client);
  const { data, error } = await supabase.from("audit_log").select("*").order("created_at", { ascending: false }).limit(limit);
  if (error) throw error;
  return (data ?? []) as AuditLogEntry[];
}

export async function listAuditLogForEntity(entityType: string, entityId: string, client?: SupabaseClient): Promise<AuditLogEntry[]> {
  const supabase = await resolveClient(client);
  const { data, error } = await supabase
    .from("audit_log")
    .select("*")
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as AuditLogEntry[];
}
