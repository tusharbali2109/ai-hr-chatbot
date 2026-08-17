import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";
import type { Job, JobStatus, EmploymentType } from "@/lib/types/database";

async function resolveClient(client?: SupabaseClient): Promise<SupabaseClient> {
  if (client) return client;
  return (await createServerClient()) as unknown as SupabaseClient;
}

export async function listJobs(): Promise<Job[]> {
  const supabase = await resolveClient();
  const { data, error } = await supabase
    .from("jobs")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as Job[];
}

/** Optional client param — the assessment evaluation agent runs from the
 * candidate-facing submit route with no recruiter session and must pass the
 * service-role client explicitly, same pattern as every other service. */
export async function getJob(id: string, client?: SupabaseClient): Promise<Job | null> {
  const supabase = await resolveClient(client);
  const { data, error } = await supabase.from("jobs").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data as Job | null;
}

export interface CreateJobInput {
  company_id: string;
  title: string;
  description: string;
  location: string;
  employment_type: EmploymentType;
  experience_min: number;
  experience_max: number;
  status?: JobStatus;
}

export async function createJob(input: CreateJobInput): Promise<Job> {
  const supabase = await resolveClient();
  const { data, error } = await supabase
    .from("jobs")
    .insert({ ...input, status: input.status ?? "open" })
    .select("*")
    .single();

  if (error) throw error;
  return data as Job;
}
