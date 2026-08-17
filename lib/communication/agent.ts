import type { SupabaseClient } from "@supabase/supabase-js";
import { getActiveTemplate, findEmailByIdempotencyKey, createEmailMessage } from "@/lib/services/email";
import { getEmailProvider } from "@/lib/communication/registry";
import { renderTemplate, computeIdempotencyKey } from "@/lib/communication/logic";
import { logInternalEvent } from "@/lib/services/ingestion";
import type { EmailTemplateName, EmailMessage } from "@/lib/types/database";

export interface SendTemplateInput {
  companyId: string;
  candidateId: string | null;
  applicationId: string | null;
  templateName: EmailTemplateName;
  eventType: string;
  recipient: string;
  variables: Record<string, string>;
}

export interface SendTemplateResult {
  status: "SENT" | "FAILED" | "ALREADY_SENT";
  message: EmailMessage | null;
  error?: string;
}

/**
 * The CommunicationAgent's core primitive — every specific "send X email"
 * function below is a thin wrapper around this. Deterministic orchestrator
 * (no LLM involved), mirroring lib/jobboards/agent.ts's shape: validate ->
 * check idempotency -> call the pluggable provider -> record the outcome.
 * A provider failure is recorded as a FAILED row and returned, never thrown
 * past this boundary — the caller (e.g. an assessment/scheduling flow)
 * must never let an email failure abort its own already-completed work.
 */
export async function sendTemplateEmail(input: SendTemplateInput, client?: SupabaseClient): Promise<SendTemplateResult> {
  const template = await getActiveTemplate(input.templateName, client);
  if (!template) {
    return { status: "FAILED", message: null, error: `No active template found for "${input.templateName}".` };
  }

  const idempotencyKey = computeIdempotencyKey(input.applicationId ?? input.recipient, input.eventType, template.version);

  const existing = await findEmailByIdempotencyKey(idempotencyKey, client);
  if (existing) {
    return { status: "ALREADY_SENT", message: existing };
  }

  let subject: string;
  let body: string;
  try {
    subject = renderTemplate(template.subject, input.variables);
    body = renderTemplate(template.body, input.variables);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to render email template.";
    return { status: "FAILED", message: null, error: message };
  }

  const provider = getEmailProvider();
  const result = await provider.sendEmail({ to: input.recipient, subject, body });

  let record: EmailMessage;
  try {
    record = await createEmailMessage(
      {
        companyId: input.companyId,
        candidateId: input.candidateId,
        applicationId: input.applicationId,
        template: template.template_name,
        templateVersion: template.version,
        eventType: input.eventType,
        idempotencyKey,
        recipient: input.recipient,
        subject,
        body,
        status: result.success ? "SENT" : "FAILED",
        provider: provider.name,
        externalMessageId: result.externalMessageId,
        sentAt: result.success ? new Date().toISOString() : null,
        error: result.error,
        metadata: provider.name === "dev" ? { dev_mode: true } : {},
      },
      client
    );
  } catch (err) {
    // Unique-constraint race: another concurrent call already inserted the
    // same idempotency key between our lookup and this insert. Treat it the
    // same as ALREADY_SENT rather than surfacing a spurious failure.
    const existingAfterRace = await findEmailByIdempotencyKey(idempotencyKey, client);
    if (existingAfterRace) return { status: "ALREADY_SENT", message: existingAfterRace };
    throw err;
  }

  await logInternalEvent(
    result.success ? "communication.email.sent" : "communication.email.failed",
    {
      application_id: input.applicationId ?? undefined,
      candidate_id: input.candidateId ?? undefined,
      payload: { template: input.templateName, recipient: input.recipient, error: result.error ?? undefined },
    },
    client
  );

  return { status: result.success ? "SENT" : "FAILED", message: record, error: result.error ?? undefined };
}

export interface CandidateEmailContext {
  companyId: string;
  companyName: string;
  candidateId: string;
  applicationId: string;
  candidateName: string;
  candidateEmail: string;
  jobTitle: string;
}

export async function sendAssessmentInvitation(
  ctx: CandidateEmailContext,
  fields: { assessmentLink: string; deadline: string },
  client?: SupabaseClient
): Promise<SendTemplateResult> {
  return sendTemplateEmail(
    {
      companyId: ctx.companyId,
      candidateId: ctx.candidateId,
      applicationId: ctx.applicationId,
      templateName: "ASSESSMENT_INVITATION",
      eventType: "assessment.invitation",
      recipient: ctx.candidateEmail,
      variables: {
        candidate_name: ctx.candidateName,
        job_title: ctx.jobTitle,
        company_name: ctx.companyName,
        assessment_link: fields.assessmentLink,
        deadline: fields.deadline,
      },
    },
    client
  );
}

export async function sendAssessmentReminder(
  ctx: CandidateEmailContext,
  fields: { assessmentLink: string; deadline: string },
  client?: SupabaseClient
): Promise<SendTemplateResult> {
  return sendTemplateEmail(
    {
      companyId: ctx.companyId,
      candidateId: ctx.candidateId,
      applicationId: ctx.applicationId,
      templateName: "ASSESSMENT_REMINDER",
      eventType: "assessment.reminder_24h",
      recipient: ctx.candidateEmail,
      variables: {
        candidate_name: ctx.candidateName,
        job_title: ctx.jobTitle,
        company_name: ctx.companyName,
        assessment_link: fields.assessmentLink,
        deadline: fields.deadline,
      },
    },
    client
  );
}

export async function sendAssessmentSubmittedConfirmation(ctx: CandidateEmailContext, client?: SupabaseClient): Promise<SendTemplateResult> {
  return sendTemplateEmail(
    {
      companyId: ctx.companyId,
      candidateId: ctx.candidateId,
      applicationId: ctx.applicationId,
      templateName: "ASSESSMENT_SUBMITTED",
      eventType: "assessment.submitted_confirmation",
      recipient: ctx.candidateEmail,
      variables: { candidate_name: ctx.candidateName, job_title: ctx.jobTitle, company_name: ctx.companyName },
    },
    client
  );
}

export async function sendNextStepEmail(ctx: CandidateEmailContext, fields: { nextSteps: string }, client?: SupabaseClient): Promise<SendTemplateResult> {
  return sendTemplateEmail(
    {
      companyId: ctx.companyId,
      candidateId: ctx.candidateId,
      applicationId: ctx.applicationId,
      templateName: "NEXT_STEP",
      eventType: "application.next_step",
      recipient: ctx.candidateEmail,
      variables: { candidate_name: ctx.candidateName, job_title: ctx.jobTitle, company_name: ctx.companyName, next_steps: fields.nextSteps },
    },
    client
  );
}

export async function sendRejectionEmail(ctx: CandidateEmailContext, client?: SupabaseClient): Promise<SendTemplateResult> {
  return sendTemplateEmail(
    {
      companyId: ctx.companyId,
      candidateId: ctx.candidateId,
      applicationId: ctx.applicationId,
      templateName: "REJECTION",
      eventType: "application.rejected",
      recipient: ctx.candidateEmail,
      variables: { candidate_name: ctx.candidateName, job_title: ctx.jobTitle, company_name: ctx.companyName },
    },
    client
  );
}

export async function sendNeedsReviewEmail(ctx: CandidateEmailContext, client?: SupabaseClient): Promise<SendTemplateResult> {
  return sendTemplateEmail(
    {
      companyId: ctx.companyId,
      candidateId: ctx.candidateId,
      applicationId: ctx.applicationId,
      templateName: "NEEDS_REVIEW",
      eventType: "application.needs_review",
      recipient: ctx.candidateEmail,
      variables: { candidate_name: ctx.candidateName, job_title: ctx.jobTitle, company_name: ctx.companyName },
    },
    client
  );
}

export async function sendInterviewInvitation(
  ctx: CandidateEmailContext,
  fields: { interviewDate: string; interviewTime: string; interviewerName: string; meetingLink: string },
  client?: SupabaseClient
): Promise<SendTemplateResult> {
  return sendTemplateEmail(
    {
      companyId: ctx.companyId,
      candidateId: ctx.candidateId,
      applicationId: ctx.applicationId,
      templateName: "INTERVIEW_INVITATION",
      eventType: "interview.invitation",
      recipient: ctx.candidateEmail,
      variables: {
        candidate_name: ctx.candidateName,
        job_title: ctx.jobTitle,
        company_name: ctx.companyName,
        interview_date: fields.interviewDate,
        interview_time: fields.interviewTime,
        interviewer_name: fields.interviewerName,
        meeting_link: fields.meetingLink,
      },
    },
    client
  );
}

export async function sendInterviewRescheduleEmail(
  ctx: CandidateEmailContext,
  fields: { interviewDate: string; interviewTime: string; meetingLink: string },
  client?: SupabaseClient
): Promise<SendTemplateResult> {
  return sendTemplateEmail(
    {
      companyId: ctx.companyId,
      candidateId: ctx.candidateId,
      applicationId: ctx.applicationId,
      templateName: "INTERVIEW_RESCHEDULE",
      eventType: `interview.reschedule:${fields.interviewDate}:${fields.interviewTime}`,
      recipient: ctx.candidateEmail,
      variables: {
        candidate_name: ctx.candidateName,
        job_title: ctx.jobTitle,
        company_name: ctx.companyName,
        interview_date: fields.interviewDate,
        interview_time: fields.interviewTime,
        meeting_link: fields.meetingLink,
      },
    },
    client
  );
}

export async function sendInterviewReminder(
  ctx: CandidateEmailContext,
  fields: { interviewDate: string; interviewTime: string; window: "24h" | "2h" },
  client?: SupabaseClient
): Promise<SendTemplateResult> {
  return sendTemplateEmail(
    {
      companyId: ctx.companyId,
      candidateId: ctx.candidateId,
      applicationId: ctx.applicationId,
      templateName: "INTERVIEW_REMINDER",
      eventType: `interview.reminder_${fields.window}`,
      recipient: ctx.candidateEmail,
      variables: {
        candidate_name: ctx.candidateName,
        job_title: ctx.jobTitle,
        company_name: ctx.companyName,
        interview_date: fields.interviewDate,
        interview_time: fields.interviewTime,
      },
    },
    client
  );
}
