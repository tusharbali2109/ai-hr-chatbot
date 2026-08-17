"use server";

import { revalidatePath } from "next/cache";
import { getJob } from "@/lib/services/jobs";
import { getAuthedCompanyId, assertJobOwnership } from "@/lib/services/jd";
import { listJobPostings } from "@/lib/services/jobboards";
import { listPlatforms, checkConnection } from "@/lib/jobboards/registry";
import { validateJobForPublish, isRetryable } from "@/lib/jobboards/logic";
import { publishJobToPlatform, type PublishResult } from "@/lib/jobboards/agent";
import { syncJobPostingApplications, type SyncResult } from "@/lib/services/sync";

export interface PlatformChecklistItem {
  platform: string;
  available: boolean;
  connected: boolean;
  connectionError: string | null;
  capabilities: { canCreateJob: boolean; canUpdateJob: boolean; canCloseJob: boolean; canFetchApplications: boolean; canReceiveWebhooks: boolean } | null;
  existingStatus: string | null;
  canRetry: boolean;
}

export interface PublishChecklistResult {
  jobValid: boolean;
  jobErrors: string[];
  platforms: PlatformChecklistItem[];
}

/** Read-only — powers the Publish Job modal's platform checklist + preview. */
export async function checkPlatformChecklistAction(jobId: string): Promise<PublishChecklistResult> {
  const { companyId } = await getAuthedCompanyId();
  await assertJobOwnership(jobId, companyId);

  const job = await getJob(jobId);
  if (!job) throw new Error("Job not found.");

  const { valid, errors } = validateJobForPublish(job);
  const existingPostings = await listJobPostings(jobId);
  const postingByPlatform = new Map(existingPostings.map((p) => [p.platform, p]));

  const platforms: PlatformChecklistItem[] = await Promise.all(
    listPlatforms().map(async (listing) => {
      if (!listing.available) {
        return {
          platform: listing.platform,
          available: false,
          connected: false,
          connectionError: "Not available in this environment.",
          capabilities: null,
          existingStatus: postingByPlatform.get(listing.platform)?.status ?? null,
          canRetry: false,
        };
      }

      const connection = await checkConnection(listing.platform, companyId);
      const existing = postingByPlatform.get(listing.platform);

      return {
        platform: listing.platform,
        available: true,
        connected: connection.connected,
        connectionError: connection.error ?? null,
        capabilities: listing.connector!.capabilities,
        existingStatus: existing?.status ?? null,
        canRetry: existing ? isRetryable(existing.status) : false,
      };
    })
  );

  return { jobValid: valid, jobErrors: errors, platforms };
}

export interface PublishJobActionResult {
  results: PublishResult[];
}

export async function publishJobAction(jobId: string, platforms: string[]): Promise<PublishJobActionResult> {
  if (platforms.length === 0) {
    throw new Error("Select at least one platform to publish to.");
  }

  const results: PublishResult[] = [];
  for (const platform of platforms) {
    results.push(await publishJobToPlatform(jobId, platform));
  }

  revalidatePath(`/jobs/${jobId}`);
  return { results };
}

export async function retryPublishAction(jobId: string, platform: string): Promise<PublishResult> {
  const result = await publishJobToPlatform(jobId, platform);
  revalidatePath(`/jobs/${jobId}`);
  return result;
}

export async function syncApplicationsAction(jobId: string, jobPostingId: string): Promise<SyncResult> {
  const result = await syncJobPostingApplications(jobPostingId);
  revalidatePath(`/jobs/${jobId}`);
  revalidatePath("/candidates");
  return result;
}
