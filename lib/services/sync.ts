import { createClient } from "@/lib/supabase/server";
import { getConnector } from "@/lib/jobboards/registry";
import { assertCapability } from "@/lib/jobboards/connector";
import { computeBackoffDelayMs, isRetryExhausted } from "@/lib/webhooks/logic";
import { RateLimitError } from "@/lib/jobboards/connectors/mock";
import { ingestApplicant } from "@/lib/services/ingestion";
import { getAuthedCompanyId, assertJobOwnership } from "@/lib/services/jd";
import { updateJobPostingSync } from "@/lib/services/jobboards";
import { maybeAutoScreenApplication } from "@/lib/screening/auto-trigger";
import type { JobPosting } from "@/lib/types/database";
import type { ApplicationsPage } from "@/lib/jobboards/connector";

export interface SyncResult {
  imported: number;
  newApplications: number;
  failed: number;
  errors: string[];
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchApplicationsPageWithRetry(
  connector: ReturnType<typeof getConnector>,
  externalJobId: string,
  cursor: string | null
): Promise<ApplicationsPage> {
  let attempt = 1;
  for (;;) {
    try {
      return await connector!.getApplications(externalJobId, cursor);
    } catch (err) {
      if (!(err instanceof RateLimitError) || isRetryExhausted(attempt)) throw err;
      const delayMs = computeBackoffDelayMs(attempt);
      if (delayMs == null) throw err;
      await delay(delayMs);
      attempt += 1;
    }
  }
}

/**
 * Pages through a job posting's applications on its connector, ingesting
 * each one via the shared ingestion pipeline. Used both for manual "Sync
 * Now" and would back a future scheduled sync for platforms without
 * webhooks. Tracks sync_cursor so re-running only imports what's new.
 */
export async function syncJobPostingApplications(jobPostingId: string): Promise<SyncResult> {
  const supabase = await createClient();
  const { data: posting, error } = await supabase.from("job_postings").select("*").eq("id", jobPostingId).single();
  if (error) throw error;
  const jobPosting = posting as JobPosting;

  const { companyId } = await getAuthedCompanyId();
  await assertJobOwnership(jobPosting.job_id, companyId);

  const connector = getConnector(jobPosting.platform);
  if (!connector) {
    throw new Error(`Integration not configured: no connector registered for "${jobPosting.platform}".`);
  }
  assertCapability(connector, "canFetchApplications");

  if (!jobPosting.external_job_id) {
    throw new Error("This job has not been published to this platform yet.");
  }

  const result: SyncResult = { imported: 0, newApplications: 0, failed: 0, errors: [] };
  let cursor: string | null = jobPosting.sync_cursor;
  let pagesFetched = 0;
  const MAX_PAGES = 50; // safety bound against a runaway/misbehaving connector

  do {
    const page = await fetchApplicationsPageWithRetry(connector, jobPosting.external_job_id, cursor);
    pagesFetched += 1;

    for (const raw of page.applications) {
      try {
        const ingestResult = await ingestApplicant(raw, jobPosting.platform, jobPosting.job_id, supabase);
        result.imported += 1;
        if (ingestResult.outcome === "created") {
          result.newApplications += 1;
          if (ingestResult.applicationId) {
            await maybeAutoScreenApplication(ingestResult.applicationId, jobPosting.job_id, supabase);
          }
        }
      } catch (err) {
        result.failed += 1;
        result.errors.push(err instanceof Error ? err.message : "Unknown ingestion error.");
      }
    }

    cursor = page.nextCursor;
  } while (cursor && pagesFetched < MAX_PAGES);

  await updateJobPostingSync(jobPostingId, {
    last_synced_at: new Date().toISOString(),
    sync_cursor: cursor,
    last_error: result.errors[0] ?? null,
  });

  return result;
}
