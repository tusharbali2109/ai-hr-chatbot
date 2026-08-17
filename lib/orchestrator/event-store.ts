import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";
import type { WorkflowEvent } from "@/lib/types/database";

async function resolveClient(client?: SupabaseClient): Promise<SupabaseClient> {
  if (client) return client;
  return (await createServerClient()) as unknown as SupabaseClient;
}

const UNIQUE_VIOLATION = "23505";

export interface EmitWorkflowEventResult {
  alreadyProcessed: boolean;
  event: WorkflowEvent | null;
}

/**
 * The real idempotency mechanism (spec §28/29). event_id is computed
 * deterministically by the caller — a redelivered "same" event collides on
 * workflow_events' unique(event_id) constraint, which Postgres enforces
 * atomically, so this is race-safe even if two requests attempt to emit the
 * identical event at the same instant (spec §51's "two workers processing
 * the same event" concurrency requirement, solved for free by the database
 * rather than any application-level locking).
 */
export async function emitWorkflowEvent(
  eventId: string,
  eventType: string,
  applicationId: string | null,
  payload: Record<string, unknown> = {},
  client?: SupabaseClient
): Promise<EmitWorkflowEventResult> {
  const supabase = await resolveClient(client);
  const { data, error } = await supabase
    .from("workflow_events")
    .insert({ event_id: eventId, event_type: eventType, application_id: applicationId, payload })
    .select("*")
    .single();

  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      return { alreadyProcessed: true, event: null };
    }
    throw error;
  }

  return { alreadyProcessed: false, event: data as WorkflowEvent };
}

export async function markEventProcessed(eventId: string, client?: SupabaseClient): Promise<void> {
  const supabase = await resolveClient(client);
  const { error } = await supabase
    .from("workflow_events")
    .update({ processed: true, processed_at: new Date().toISOString() })
    .eq("event_id", eventId);
  if (error) throw error;
}

/** Computes a stable event_id for a given (applicationId, eventType,
 * sourceId) triple — the same logical event always produces the same id,
 * regardless of how many times it's delivered. */
export function computeEventId(applicationId: string, eventType: string, sourceId: string): string {
  return `${applicationId}:${eventType}:${sourceId}`;
}
