import { createClient } from "@/lib/supabase/server";
import { listJobs } from "@/lib/services/jobs";
import { JobsBoard } from "./JobsBoard";

export default async function JobsPage() {
  const [jobs, supabase] = await Promise.all([listJobs(), createClient()]);

  const { data: applications } = await supabase
    .from("applications")
    .select("job_id, current_stage");

  const counts = new Map<string, { total: number; shortlisted: number }>();
  for (const app of applications ?? []) {
    const entry = counts.get(app.job_id) ?? { total: 0, shortlisted: 0 };
    entry.total += 1;
    if (["SHORTLISTED", "ASSESSMENT_SHORTLISTED", "FINAL_SHORTLISTED", "INTERVIEW_SHORTLISTED"].includes(app.current_stage)) {
      entry.shortlisted += 1;
    }
    counts.set(app.job_id, entry);
  }

  const jobsWithCounts = jobs.map((job) => ({
    job,
    applicationCount: counts.get(job.id)?.total ?? 0,
    shortlistedCount: counts.get(job.id)?.shortlisted ?? 0,
  }));

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Jobs</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {jobs.length} open roles across your company.
          </p>
        </div>
      </div>

      <JobsBoard items={jobsWithCounts} />
    </div>
  );
}
