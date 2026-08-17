import { getJob } from "@/lib/services/jobs";
import { getAuthedCompanyId, assertJobOwnership } from "@/lib/services/jd";
import { createOrGetJobPosting, updateJobPostingStatus } from "@/lib/services/jobboards";
import { getConnector, checkConnection } from "@/lib/jobboards/registry";
import { assertCapability, type JobPostingInput } from "@/lib/jobboards/connector";
import { validateJobForPublish } from "@/lib/jobboards/logic";
import type { Job, JobPosting } from "@/lib/types/database";

export interface PublishResult {
  platform: string;
  status: JobPosting["status"];
  externalUrl: string | null;
  error: string | null;
}

function toJobPostingInput(job: Job): JobPostingInput {
  return {
    title: job.title,
    description: job.description,
    location: job.location,
    employmentType: job.employment_type,
    experienceMin: job.experience_min,
    experienceMax: job.experience_max,
    requiredSkills: job.required_skills,
  };
}

/**
 * Orchestrates publishing one job to one platform. Contains NO
 * platform-specific logic — every platform-specific detail lives in the
 * connector (lib/jobboards/connectors/*). This function only: validates,
 * looks up the connector via the registry, checks capability/connection,
 * calls the connector, and records the result.
 */
export async function publishJobToPlatform(jobId: string, platform: string): Promise<PublishResult> {
  const { companyId } = await getAuthedCompanyId();
  await assertJobOwnership(jobId, companyId);

  const job = await getJob(jobId);
  if (!job) throw new Error("Job not found.");

  const validation = validateJobForPublish(job);
  if (!validation.valid) {
    throw new Error(`Cannot publish this job: ${validation.errors.join(" ")}`);
  }

  const connector = getConnector(platform);
  if (!connector) {
    const posting = await createOrGetJobPosting(jobId, platform);
    await updateJobPostingStatus(posting.id, "FAILED", { last_error: "Integration not configured for this platform." });
    return { platform, status: "FAILED", externalUrl: null, error: "Integration not configured for this platform." };
  }

  try {
    assertCapability(connector, "canCreateJob");
  } catch (err) {
    const posting = await createOrGetJobPosting(jobId, platform);
    const message = err instanceof Error ? err.message : "API capability unavailable.";
    await updateJobPostingStatus(posting.id, "FAILED", { last_error: message });
    return { platform, status: "FAILED", externalUrl: null, error: message };
  }

  const connection = await checkConnection(platform, companyId);
  if (!connection.connected) {
    const posting = await createOrGetJobPosting(jobId, platform);
    const message = connection.error ?? "Integration not configured.";
    await updateJobPostingStatus(posting.id, "FAILED", { last_error: message });
    return { platform, status: "FAILED", externalUrl: null, error: message };
  }

  const posting = await createOrGetJobPosting(jobId, platform);
  await updateJobPostingStatus(posting.id, "PUBLISHING");

  const input = toJobPostingInput(job);

  try {
    if (posting.external_job_id) {
      // Retry path: the platform already has this job — update it instead
      // of creating a duplicate external posting.
      assertCapability(connector, "canUpdateJob");
      await connector.updateJob(posting.external_job_id, input);
      const updated = await updateJobPostingStatus(posting.id, "PUBLISHED", {
        published_at: new Date().toISOString(),
        last_error: null,
      });
      return { platform, status: updated.status, externalUrl: updated.external_url, error: null };
    }

    const created = await connector.createJob(input);
    const updated = await updateJobPostingStatus(posting.id, "PUBLISHED", {
      external_job_id: created.externalJobId,
      external_url: created.externalUrl,
      published_at: new Date().toISOString(),
      last_error: null,
    });
    return { platform, status: updated.status, externalUrl: updated.external_url, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Publishing failed for an unknown reason.";
    // Preserve any existing external_job_id so a subsequent retry stays idempotent.
    await updateJobPostingStatus(posting.id, "FAILED", { last_error: message });
    return { platform, status: "FAILED", externalUrl: posting.external_url, error: message };
  }
}
