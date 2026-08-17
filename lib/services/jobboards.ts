import { createClient } from "@/lib/supabase/server";
import type { JobBoardConnectionStatus, JobBoardConnectionSummary, JobPosting, JobPostingStatus } from "@/lib/types/database";
import { getAuthedCompanyId, assertJobOwnership } from "@/lib/services/jd";

/** Column list deliberately excludes `credentials` — never selected by any
 * normal, client-facing service call. */
const CONNECTION_SUMMARY_COLUMNS =
  "id, company_id, platform, status, capabilities, connected_at, last_sync_at, last_error, created_at, updated_at";

export async function listConnections(): Promise<JobBoardConnectionSummary[]> {
  const { companyId } = await getAuthedCompanyId();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("job_board_credentials")
    .select(CONNECTION_SUMMARY_COLUMNS)
    .eq("company_id", companyId);

  if (error) throw error;
  return (data ?? []) as unknown as JobBoardConnectionSummary[];
}

export async function getConnection(platform: string): Promise<JobBoardConnectionSummary | null> {
  const { companyId } = await getAuthedCompanyId();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("job_board_credentials")
    .select(CONNECTION_SUMMARY_COLUMNS)
    .eq("company_id", companyId)
    .eq("platform", platform)
    .maybeSingle();

  if (error) throw error;
  return data as unknown as JobBoardConnectionSummary | null;
}

export async function upsertConnectionStatus(
  platform: string,
  status: JobBoardConnectionStatus,
  fields: Partial<Pick<JobBoardConnectionSummary, "capabilities" | "last_error" | "last_sync_at" | "connected_at">> = {}
): Promise<void> {
  const { companyId } = await getAuthedCompanyId();
  const supabase = await createClient();

  const { error } = await supabase.from("job_board_credentials").upsert(
    {
      company_id: companyId,
      platform,
      status,
      ...fields,
    },
    { onConflict: "company_id,platform" }
  );

  if (error) throw error;
}

export async function listJobPostings(jobId: string): Promise<JobPosting[]> {
  const { companyId } = await getAuthedCompanyId();
  await assertJobOwnership(jobId, companyId);
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("job_postings")
    .select("*")
    .eq("job_id", jobId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (data ?? []) as JobPosting[];
}

export async function getJobPosting(jobId: string, platform: string): Promise<JobPosting | null> {
  const { companyId } = await getAuthedCompanyId();
  await assertJobOwnership(jobId, companyId);
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("job_postings")
    .select("*")
    .eq("job_id", jobId)
    .eq("platform", platform)
    .maybeSingle();

  if (error) throw error;
  return data as JobPosting | null;
}

/** Creates the job_postings row on first publish, or returns the existing
 * one on retry — this is what makes republish/retry idempotent. */
export async function createOrGetJobPosting(jobId: string, platform: string): Promise<JobPosting> {
  const existing = await getJobPosting(jobId, platform);
  if (existing) return existing;

  const { companyId } = await getAuthedCompanyId();
  await assertJobOwnership(jobId, companyId);
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("job_postings")
    .insert({ job_id: jobId, platform, status: "DRAFT" })
    .select("*")
    .single();

  if (error) throw error;
  return data as JobPosting;
}

export async function updateJobPostingStatus(
  jobPostingId: string,
  status: JobPostingStatus,
  fields: Partial<Pick<JobPosting, "external_job_id" | "external_url" | "published_at" | "last_error" | "metadata">> = {}
): Promise<JobPosting> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("job_postings")
    .update({ status, ...fields })
    .eq("id", jobPostingId)
    .select("*")
    .single();

  if (error) throw error;
  return data as JobPosting;
}

export async function updateJobPostingSync(
  jobPostingId: string,
  fields: Partial<Pick<JobPosting, "last_synced_at" | "sync_cursor" | "last_error">>
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("job_postings").update(fields).eq("id", jobPostingId);
  if (error) throw error;
}

/** Recent publish/status-change activity for the Activity feed. */
export async function getJobPostingActivity(jobId: string, limit = 10): Promise<JobPosting[]> {
  const { companyId } = await getAuthedCompanyId();
  await assertJobOwnership(jobId, companyId);
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("job_postings")
    .select("*")
    .eq("job_id", jobId)
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as JobPosting[];
}
