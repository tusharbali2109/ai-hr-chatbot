import Link from "next/link";
import { ClipboardCheck } from "lucide-react";
import { listAssessmentsForCompany } from "@/lib/services/assessments";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/Badge";
import type { AssessmentStatus } from "@/lib/types/database";
import { createClient } from "@/lib/supabase/server";
import { CreateAssessmentButton } from "./CreateAssessmentButton";

const STATUS_TONE: Record<AssessmentStatus, "neutral" | "info" | "success" | "warning" | "danger"> = {
  DRAFT: "neutral",
  READY: "success",
  SENT: "info",
  IN_PROGRESS: "info",
  SUBMITTED: "info",
  EVALUATING: "warning",
  EVALUATED: "success",
  EXPIRED: "danger",
  CANCELLED: "neutral",
};

export default async function AssessmentsPage() {
  const [assessments, supabase] = await Promise.all([listAssessmentsForCompany(), createClient()]);
  const { data: approvedJobs, error } = await supabase.from("jobs").select("id,title").eq("jd_status", "APPROVED").order("title");
  if (error) throw error;
  const assessmentJobIds = new Set(assessments.map((assessment) => assessment.job_id));
  const jobs = (approvedJobs ?? []).map((job) => ({ id: job.id as string, title: job.title as string, hasAssessment: assessmentJobIds.has(job.id as string) }));

  if (assessments.length === 0) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-8">
        <div className="mb-6 flex items-center justify-between gap-3"><div><h1 className="text-2xl font-semibold tracking-tight text-foreground">Assessments</h1><p className="mt-1 text-sm text-muted-foreground">Generate assessments from approved job descriptions.</p></div><CreateAssessmentButton jobs={jobs} /></div>
        <EmptyState
        icon={ClipboardCheck}
        title="No assessments yet"
        description="Generate a job-specific assessment from a job's detail page once its JD is approved."
        action={<Link href="/jobs" className="text-sm font-medium text-accent hover:underline">Open jobs</Link>}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between gap-3"><h1 className="text-2xl font-semibold tracking-tight text-foreground">Assessments</h1><CreateAssessmentButton jobs={jobs} /></div>
      <div className="flex flex-col gap-3">
        {assessments.map((a) => (
          <Link
            key={a.id}
            href={`/assessments/${a.id}/builder`}
            className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-lg)] border border-border bg-surface p-5 hover:border-accent/50"
          >
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-foreground">{a.title}</span>
                <Badge tone={STATUS_TONE[a.status]}>{a.status}</Badge>
                <Badge tone="neutral">v{a.assessment_version}</Badge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {a.job_title} · {a.type.replace(/_/g, " ")}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
