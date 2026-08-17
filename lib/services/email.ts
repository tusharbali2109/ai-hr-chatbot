import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";
import type { EmailTemplate, EmailTemplateName, EmailMessage, EmailMessageStatus } from "@/lib/types/database";

async function resolveClient(client?: SupabaseClient): Promise<SupabaseClient> {
  if (client) return client;
  return (await createServerClient()) as unknown as SupabaseClient;
}

export async function getActiveTemplate(name: EmailTemplateName, client?: SupabaseClient): Promise<EmailTemplate | null> {
  const supabase = await resolveClient(client);
  const { data, error } = await supabase
    .from("email_templates")
    .select("*")
    .eq("template_name", name)
    .eq("is_latest", true)
    .maybeSingle();
  if (error) throw error;
  return data as EmailTemplate | null;
}

export async function findEmailByIdempotencyKey(key: string, client?: SupabaseClient): Promise<EmailMessage | null> {
  const supabase = await resolveClient(client);
  const { data, error } = await supabase.from("email_messages").select("*").eq("idempotency_key", key).maybeSingle();
  if (error) throw error;
  return data as EmailMessage | null;
}

export interface CreateEmailMessageInput {
  companyId: string;
  candidateId: string | null;
  applicationId: string | null;
  template: string;
  templateVersion: number;
  eventType: string;
  idempotencyKey: string;
  recipient: string;
  subject: string;
  body: string;
  status: EmailMessageStatus;
  provider: string;
  externalMessageId: string | null;
  sentAt: string | null;
  error: string | null;
  metadata: Record<string, unknown>;
}

/**
 * Inserts the message row. The idempotency_key unique constraint is the
 * real duplicate-send guard — a conflict here means an equivalent email
 * already exists, which the caller (CommunicationAgent) treats as
 * "already sent" rather than an error to surface.
 */
export async function createEmailMessage(input: CreateEmailMessageInput, client?: SupabaseClient): Promise<EmailMessage> {
  const supabase = await resolveClient(client);
  const { data, error } = await supabase
    .from("email_messages")
    .insert({
      company_id: input.companyId,
      candidate_id: input.candidateId,
      application_id: input.applicationId,
      template: input.template,
      template_version: input.templateVersion,
      event_type: input.eventType,
      idempotency_key: input.idempotencyKey,
      recipient: input.recipient,
      subject: input.subject,
      body: input.body,
      status: input.status,
      provider: input.provider,
      external_message_id: input.externalMessageId,
      sent_at: input.sentAt,
      error: input.error,
      metadata: input.metadata,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as EmailMessage;
}

export async function updateEmailMessageStatus(
  id: string,
  fields: Partial<Pick<EmailMessage, "status" | "delivered_at" | "failed_at" | "error" | "external_message_id">>,
  client?: SupabaseClient
): Promise<void> {
  const supabase = await resolveClient(client);
  const { error } = await supabase.from("email_messages").update(fields).eq("id", id);
  if (error) throw error;
}

export async function listEmailMessagesForApplication(applicationId: string, client?: SupabaseClient): Promise<EmailMessage[]> {
  const supabase = await resolveClient(client);
  const { data, error } = await supabase
    .from("email_messages")
    .select("*")
    .eq("application_id", applicationId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as EmailMessage[];
}

export interface EmailMessageFilters {
  status?: EmailMessageStatus;
  template?: string;
}

/** Powers the Communications Center — company-scoped via RLS, most recent first. */
export async function listEmailMessagesForCompany(filters: EmailMessageFilters = {}, client?: SupabaseClient): Promise<EmailMessage[]> {
  const supabase = await resolveClient(client);
  let query = supabase.from("email_messages").select("*").order("created_at", { ascending: false }).limit(200);
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.template) query = query.eq("template", filters.template);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as EmailMessage[];
}
