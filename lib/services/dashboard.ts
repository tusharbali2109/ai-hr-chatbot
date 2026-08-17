import { createClient } from "@/lib/supabase/server";
import type { ApplicationWithRelations } from "@/lib/services/applications";
import type { StageHistory } from "@/lib/types/database";

export interface DashboardStats {
  activeJobs: number;
  totalCandidates: number;
  applications: number;
  aiScreening: number;
  pendingScreening: number;
  shortlisted: number;
  needsReview: number;
  rejected: number;
  interviews: number;
  assessments: number;
  finalReview: number;
  selected: number;
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const supabase = await createClient();

  const [jobsRes, candidatesRes, applicationsRes] = await Promise.all([
    supabase.from("jobs").select("id", { count: "exact", head: true }).eq("status", "open"),
    supabase.from("candidates").select("id", { count: "exact", head: true }),
    supabase.from("applications").select("current_stage"),
  ]);

  if (jobsRes.error) throw jobsRes.error;
  if (candidatesRes.error) throw candidatesRes.error;
  if (applicationsRes.error) throw applicationsRes.error;

  const stages = (applicationsRes.data ?? []).map((a) => a.current_stage);

  return {
    activeJobs: jobsRes.count ?? 0,
    totalCandidates: candidatesRes.count ?? 0,
    applications: stages.length,
    aiScreening: stages.filter((s) => s === "AI_SCREENING").length,
    pendingScreening: stages.filter((s) => s === "APPLIED").length,
    shortlisted: stages.filter((s) => s === "SHORTLISTED" || s === "ASSESSMENT_SHORTLISTED" || s === "FINAL_SHORTLISTED").length,
    needsReview: stages.filter((s) => s === "NEEDS_REVIEW").length,
    rejected: stages.filter((s) => s === "REJECTED").length,
    interviews: stages.filter((s) => s === "AI_INTERVIEW" || s === "FINAL_INTERVIEW" || s === "INTERVIEW_SCHEDULED").length,
    assessments: stages.filter((s) => s.startsWith("ASSESSMENT")).length,
    finalReview: stages.filter((s) => s === "FINAL_REVIEW").length,
    selected: stages.filter((s) => s === "SELECTED").length,
  };
}

export async function getRecentApplications(limit = 6): Promise<ApplicationWithRelations[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("applications")
    .select("*, candidate:candidates(id, name, email), job:jobs(id, title)")
    .order("applied_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as unknown as ApplicationWithRelations[];
}

export interface RecentActivityItem extends StageHistory {
  application: {
    candidate: { name: string };
    job: { title: string };
  };
}

export async function getRecentActivity(limit = 8): Promise<RecentActivityItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("stage_history")
    .select("*, application:applications(candidate:candidates(name), job:jobs(title))")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as unknown as RecentActivityItem[];
}
