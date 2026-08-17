import { createClient } from "@/lib/supabase/server";
import type { JobJdVersion } from "@/lib/types/database";
import type { JDGeneration } from "@/lib/ai/schemas";
import { isJobOwnedByCompany, computeNextVersionNumber } from "@/lib/jd/logic";

export async function listJdVersions(jobId: string): Promise<JobJdVersion[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("job_jd_versions")
    .select("*")
    .eq("job_id", jobId)
    .order("version_number", { ascending: false });

  if (error) throw error;
  return (data ?? []) as JobJdVersion[];
}

/** The JD version that was approved for this job — screenings tag this id
 * so a later JD edit never retroactively changes what an old screening was
 * evaluated against. */
export async function getApprovedJdVersion(jobId: string): Promise<JobJdVersion | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("job_jd_versions")
    .select("*")
    .eq("job_id", jobId)
    .eq("is_approved", true)
    .maybeSingle();

  if (error) throw error;
  return data as JobJdVersion | null;
}

async function getAuthedCompanyId(): Promise<{ userId: string; companyId: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: profile, error } = await supabase.from("users").select("company_id").eq("id", user.id).single();
  if (error) throw error;

  return { userId: user.id, companyId: profile.company_id };
}

/** Verifies the job belongs to the caller's company before any JD mutation. */
async function assertJobOwnership(jobId: string, companyId: string) {
  const supabase = await createClient();
  const { data: job, error } = await supabase.from("jobs").select("id, company_id").eq("id", jobId).maybeSingle();
  if (error) throw error;
  if (!isJobOwnedByCompany(job?.company_id, companyId)) {
    throw new Error("You do not have access to this job.");
  }
}

export interface CreateJobDraftInput {
  title: string;
  location: string;
  employment_type: string;
  experience_min: number | null;
  experience_max: number | null;
  work_mode: string | null;
  salary_range: string | null;
  number_of_openings: number;
}

/** Creates the job row (status DRAFT/GENERATING) that the first JD version will attach to. */
export async function createJobDraft(input: CreateJobDraftInput): Promise<string> {
  const { companyId } = await getAuthedCompanyId();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("jobs")
    .insert({
      company_id: companyId,
      title: input.title,
      description: "",
      status: "draft",
      location: input.location,
      employment_type: (["full_time", "part_time", "contract", "internship"].includes(input.employment_type)
        ? input.employment_type
        : "full_time") as "full_time" | "part_time" | "contract" | "internship",
      experience_min: input.experience_min ?? 0,
      experience_max: input.experience_max ?? 0,
      work_mode: (["remote", "hybrid", "onsite"].includes(input.work_mode ?? "") ? input.work_mode : null) as
        | "remote"
        | "hybrid"
        | "onsite"
        | null,
      salary_range: input.salary_range,
      number_of_openings: input.number_of_openings,
      jd_status: "GENERATING",
    })
    .select("id")
    .single();

  if (error) throw error;
  return data.id;
}

export interface JobFactsInput {
  location?: string;
  employment_type?: "full_time" | "part_time" | "contract" | "internship";
  experience_min?: number;
  experience_max?: number;
  work_mode?: "remote" | "hybrid" | "onsite" | null;
}

/** Persists a generated/edited JD as a new immutable version and syncs the live jobs row. */
export async function saveJdVersion(
  jobId: string,
  jd: JDGeneration,
  jdStatus: "READY_FOR_REVIEW" | "APPROVED" = "READY_FOR_REVIEW",
  facts: JobFactsInput = {}
): Promise<JobJdVersion> {
  const { userId, companyId } = await getAuthedCompanyId();
  await assertJobOwnership(jobId, companyId);
  const supabase = await createClient();

  const { data: latest } = await supabase
    .from("job_jd_versions")
    .select("version_number")
    .eq("job_id", jobId)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextVersion = computeNextVersionNumber(latest?.version_number);

  const { data: version, error: versionError } = await supabase
    .from("job_jd_versions")
    .insert({
      job_id: jobId,
      version_number: nextVersion,
      title: jd.title,
      description: jd.description,
      responsibilities: jd.responsibilities,
      required_skills: jd.required_skills,
      preferred_skills: jd.preferred_skills,
      screening_criteria: jd.screening_criteria,
      created_by: userId,
    })
    .select("*")
    .single();

  if (versionError) throw versionError;

  const { error: jobError } = await supabase
    .from("jobs")
    .update({
      title: jd.title,
      description: jd.description,
      responsibilities: jd.responsibilities,
      required_skills: jd.required_skills,
      preferred_skills: jd.preferred_skills,
      education: jd.education,
      screening_criteria: jd.screening_criteria,
      jd_status: jdStatus,
      ...facts,
    })
    .eq("id", jobId);

  if (jobError) throw jobError;

  return version as JobJdVersion;
}

/** Marks the given version (defaults to latest) as the approved one; unmarks any prior approved version. */
export async function approveJdVersion(jobId: string): Promise<void> {
  const { companyId } = await getAuthedCompanyId();
  await assertJobOwnership(jobId, companyId);
  const supabase = await createClient();

  const { data: latest, error: latestError } = await supabase
    .from("job_jd_versions")
    .select("id")
    .eq("job_id", jobId)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latestError) throw latestError;
  if (!latest) throw new Error("No JD version to approve.");

  const { error: unapproveError } = await supabase
    .from("job_jd_versions")
    .update({ is_approved: false })
    .eq("job_id", jobId)
    .eq("is_approved", true);
  if (unapproveError) throw unapproveError;

  const { error: approveError } = await supabase.from("job_jd_versions").update({ is_approved: true }).eq("id", latest.id);
  if (approveError) throw approveError;

  const { error: jobError } = await supabase.from("jobs").update({ jd_status: "APPROVED", status: "open" }).eq("id", jobId);
  if (jobError) throw jobError;
}

export { getAuthedCompanyId, assertJobOwnership };
