import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";
import type { Application, Candidate, Job } from "@/lib/types/database";

async function resolveClient(client?: SupabaseClient): Promise<SupabaseClient> {
  if (client) return client;
  return (await createServerClient()) as unknown as SupabaseClient;
}

export async function listCandidates(): Promise<Candidate[]> {
  const supabase = await resolveClient();
  const { data, error } = await supabase
    .from("candidates")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as Candidate[];
}

/** Optional client param — Phase 7's assessment-submit route calls this
 * with the service-role client (no recruiter session available there),
 * same pattern as lib/services/jobs.ts::getJob. */
export async function getCandidate(id: string, client?: SupabaseClient): Promise<Candidate | null> {
  const supabase = await resolveClient(client);
  const { data, error } = await supabase.from("candidates").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data as Candidate | null;
}

export interface CandidateApplication extends Application {
  job: Pick<Job, "id" | "title" | "location" | "employment_type">;
}

export async function listCandidateApplications(candidateId: string): Promise<CandidateApplication[]> {
  const supabase = await resolveClient();
  const { data, error } = await supabase
    .from("applications")
    .select("*, job:jobs(id, title, location, employment_type)")
    .eq("candidate_id", candidateId)
    .order("applied_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as unknown as CandidateApplication[];
}
