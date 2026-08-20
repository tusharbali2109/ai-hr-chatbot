import type { SupabaseClient } from "@supabase/supabase-js";
import { getJob } from "@/lib/services/jobs";
import { getEffectiveWorkflowSettings } from "@/lib/services/workflow";
import { screenApplication } from "@/lib/screening/agent";

/**
 * Zero-manual-work entry point: called right after a new application is
 * created by ingestion (job-board sync or webhook), so a resume goes
 * straight to AI screening — and, if shortlisted, a notification email —
 * with no recruiter click in between. A no-op (not an error) whenever the
 * job has no approved JD/screening criteria yet or ai_screening_enabled is
 * off, and never throws — a failed auto-screen must not fail ingestion,
 * which already durably recorded the application.
 */
export async function maybeAutoScreenApplication(applicationId: string, jobId: string, client: SupabaseClient): Promise<void> {
  try {
    const job = await getJob(jobId, client);
    if (!job) return;
    if (job.jd_status !== "APPROVED" || !job.screening_criteria) return;

    const settings = await getEffectiveWorkflowSettings(job.company_id, jobId, client);
    if (!settings.ai_screening_enabled) return;

    await screenApplication(applicationId, { client });
  } catch {
    // Best-effort — ingestion already succeeded; a recruiter can always
    // trigger screening manually from the application later.
  }
}
