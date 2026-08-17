import type { SupabaseClient } from "@supabase/supabase-js";
import type { ExternalEvent } from "@/lib/types/database";

/**
 * Always called with the dedicated webhook service-role client (see
 * lib/supabase/webhook-client.ts) — webhook requests have no Supabase
 * session, so there is no RLS-scoped client to fall back to.
 */
export async function isEventProcessed(client: SupabaseClient, platform: string, externalEventId: string): Promise<boolean> {
  const { data, error } = await client
    .from("external_events")
    .select("id, processed")
    .eq("platform", platform)
    .eq("external_event_id", externalEventId)
    .maybeSingle();

  if (error) throw error;
  return Boolean(data?.processed);
}

export async function recordEvent(
  client: SupabaseClient,
  fields: { platform: string; externalEventId: string; eventType: string; jobPostingId: string | null; payload: unknown }
): Promise<ExternalEvent> {
  const { data, error } = await client
    .from("external_events")
    .upsert(
      {
        platform: fields.platform,
        external_event_id: fields.externalEventId,
        event_type: fields.eventType,
        job_posting_id: fields.jobPostingId,
        payload: fields.payload,
      },
      { onConflict: "platform,external_event_id", ignoreDuplicates: true }
    )
    .select("*")
    .maybeSingle();

  if (error) throw error;
  if (data) return data as ExternalEvent;

  // Row already existed (ignoreDuplicates skipped the insert) — fetch it.
  const { data: existing, error: fetchError } = await client
    .from("external_events")
    .select("*")
    .eq("platform", fields.platform)
    .eq("external_event_id", fields.externalEventId)
    .single();
  if (fetchError) throw fetchError;
  return existing as ExternalEvent;
}

export async function markEventProcessed(client: SupabaseClient, eventId: string): Promise<void> {
  const { error } = await client
    .from("external_events")
    .update({ processed: true, processed_at: new Date().toISOString(), error: null })
    .eq("id", eventId);
  if (error) throw error;
}

export async function markEventFailed(client: SupabaseClient, eventId: string, errorMessage: string): Promise<void> {
  const { error } = await client.from("external_events").update({ error: errorMessage }).eq("id", eventId);
  if (error) throw error;
}
