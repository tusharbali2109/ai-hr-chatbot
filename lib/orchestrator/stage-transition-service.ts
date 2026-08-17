import type { SupabaseClient } from "@supabase/supabase-js";
import { getApplication, updateApplicationStage } from "@/lib/services/applications";
import { getJob } from "@/lib/services/jobs";
import { recordAuditEvent } from "@/lib/services/audit";
import { assertValidTransition } from "@/lib/orchestrator/state-machine";
import type { RecruitmentStage } from "@/lib/stages";
import type { DecisionSource } from "@/lib/types/database";

export interface TransitionStageInput {
  applicationId: string;
  toStage: RecruitmentStage;
  reason: string;
  source: DecisionSource;
  actorId?: string | null;
  metadata?: Record<string, unknown>;
  override?: boolean;
}

/**
 * The single authoritative entry point for every NEW Phase 8 stage
 * transition (final review, human approval, offer-driven). Existing
 * agents' direct updateApplicationStage() calls are left untouched — this
 * service is additive, not a replacement.
 *
 * Every call: validates the transition against the state machine (throws
 * InvalidStageTransitionError unless `override: true`), delegates the
 * actual write to the existing updateApplicationStage() (reused, not
 * duplicated), and records an audit_log entry — spec §6/§7's "every
 * transition must include from_stage/to_stage/reason/source/actor/timestamp"
 * requirement made concrete.
 */
export async function transitionStage(input: TransitionStageInput, client?: SupabaseClient): Promise<RecruitmentStage> {
  const application = await getApplication(input.applicationId, client);
  if (!application) throw new Error("Application not found.");

  const fromStage = application.current_stage;
  assertValidTransition(fromStage, input.toStage, { override: input.override });

  const job = await getJob(application.job_id, client);
  if (!job) throw new Error("Job not found.");

  await updateApplicationStage(
    input.applicationId,
    fromStage,
    input.toStage,
    input.reason,
    { ...input.metadata, decision_source: input.source },
    client
  );

  await recordAuditEvent(
    {
      companyId: job.company_id,
      actorId: input.actorId ?? null,
      actorType: input.source === "AI" ? "AI" : input.source === "HUMAN" || input.source === "CANDIDATE" ? "HUMAN" : "SYSTEM",
      action: "stage_transition",
      entityType: "application",
      entityId: input.applicationId,
      oldValue: { stage: fromStage },
      newValue: { stage: input.toStage },
      reason: input.reason,
    },
    client
  );

  return input.toStage;
}
