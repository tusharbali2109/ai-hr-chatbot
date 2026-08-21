import { notFound } from "next/navigation";
import { getJob } from "@/lib/services/jobs";
import { listApplicationsForJob } from "@/lib/services/applications";
import { listJobPostings, getJobPostingActivity } from "@/lib/services/jobboards";
import { listLatestRecommendations } from "@/lib/services/screening";
import { getLatestAssessmentForJob, getAssignmentStatsForJob } from "@/lib/services/assessments";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserProfile } from "@/lib/services/auth";
import { JobDetailTabs } from "./JobDetailTabs";
import type { RecruitmentStage } from "@/lib/stages";

export default async function JobDetailPage({ params }: PageProps<"/jobs/[id]">) {
  const { id } = await params;

  const job = await getJob(id);
  if (!job) notFound();

  const applications = await listApplicationsForJob(id);
  const jobPostings = await listJobPostings(id);
  const postingActivity = await getJobPostingActivity(id);

  const supabase = await createClient();
  const applicationIds = applications.map((a) => a.id);
  const recommendations = await listLatestRecommendations(applicationIds);
  const { data: history } = applicationIds.length
    ? await supabase
        .from("stage_history")
        .select("*, application:applications(candidate:candidates(name), job_id)")
        .in("application_id", applicationIds)
        .order("created_at", { ascending: false })
        .limit(20)
    : { data: [] };

  const activity = (history ?? []).map((h) => ({
    id: h.id as string,
    description: `${(h.application as unknown as { candidate: { name: string } })?.candidate?.name ?? "Candidate"} moved to ${h.to_stage}`,
    toStage: h.to_stage as RecruitmentStage,
    createdAt: h.created_at as string,
  }));

  const assessment = await getLatestAssessmentForJob(id);
  const assessmentStats = assessment ? await getAssignmentStatsForJob(id) : null;

  const currentUser = await getCurrentUserProfile().catch(() => null);
  const isAdmin = currentUser?.role === "admin";

  return (
    <JobDetailTabs
      job={job}
      applications={applications}
      activity={activity}
      jobPostings={jobPostings}
      postingActivity={postingActivity}
      recommendations={Object.fromEntries(recommendations)}
      assessment={assessment}
      assessmentStats={assessmentStats}
      isAdmin={isAdmin}
    />
  );
}
