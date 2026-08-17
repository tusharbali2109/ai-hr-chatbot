"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, MapPin, Briefcase, Calendar, Send, Sparkles } from "lucide-react";
import type { Job, JobPosting } from "@/lib/types/database";
import type { ApplicationWithRelations } from "@/lib/services/applications";
import { PIPELINE_STAGES, type RecruitmentStage } from "@/lib/stages";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Pipeline } from "@/components/recruitment/Pipeline";
import { CandidateTable, type CandidateRow } from "@/components/recruitment/CandidateTable";
import { ActivityFeed, type ActivityEntry } from "@/components/recruitment/ActivityFeed";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/lib/utils/cn";
import { PublishJobModal } from "./PublishJobModal";
import { PostingsPanel } from "./PostingsPanel";
import { RunScreeningModal } from "./RunScreeningModal";
import { AssessmentPanel } from "./AssessmentPanel";
import type { Assessment } from "@/lib/types/database";
import type { AssignmentStatCounts } from "@/lib/services/assessments";

const TABS = ["Overview", "JD", "Candidates", "Pipeline", "Activity"] as const;
type Tab = (typeof TABS)[number];

const JD_STATUS_LABEL: Record<Job["jd_status"], string> = {
  DRAFT: "JD Draft",
  GENERATING: "Generating JD",
  READY_FOR_REVIEW: "JD Ready for Review",
  APPROVED: "JD Approved",
};

const JD_STATUS_TONE: Record<Job["jd_status"], "neutral" | "warning" | "success"> = {
  DRAFT: "neutral",
  GENERATING: "warning",
  READY_FOR_REVIEW: "warning",
  APPROVED: "success",
};

export function JobDetailTabs({
  job,
  applications,
  activity,
  jobPostings,
  postingActivity,
  recommendations,
  assessment,
  assessmentStats,
}: {
  job: Job;
  applications: ApplicationWithRelations[];
  activity: ActivityEntry[];
  jobPostings: JobPosting[];
  postingActivity: JobPosting[];
  recommendations: Record<string, { recommendation: "SHORTLISTED" | "REJECTED" | "NEEDS_REVIEW" | null; overallScore: number | null }>;
  assessment: Assessment | null;
  assessmentStats: AssignmentStatCounts | null;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("Overview");
  const [stageFilter, setStageFilter] = useState<RecruitmentStage | null>(null);
  const [publishOpen, setPublishOpen] = useState(false);
  const [screeningOpen, setScreeningOpen] = useState(false);

  const counts = useMemo(() => {
    const map: Partial<Record<RecruitmentStage, number>> = {};
    for (const stage of PIPELINE_STAGES) map[stage] = 0;
    for (const app of applications) {
      map[app.current_stage] = (map[app.current_stage] ?? 0) + 1;
    }
    return map;
  }, [applications]);

  const rows: CandidateRow[] = applications
    .filter((a) => !stageFilter || a.current_stage === stageFilter)
    .map((a) => ({
      applicationId: a.id,
      candidateId: a.candidate.id,
      name: a.candidate.name,
      email: a.candidate.email,
      jobTitle: job.title,
      stage: a.current_stage,
      score: a.overall_score,
      appliedAt: a.applied_at,
      source: a.source,
      sourcePlatform: a.source_platform,
      recommendation: recommendations[a.id]?.recommendation ?? null,
    }));

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <Link href="/jobs" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" />
        Back to Jobs
      </Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">{job.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5" />
              {job.location}
            </span>
            <span className="flex items-center gap-1.5">
              <Briefcase className="h-3.5 w-3.5" />
              {job.experience_min}–{job.experience_max} yrs
            </span>
            <span className="flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5" />
              Posted {new Date(job.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
            </span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2.5">
          <div className="flex items-center gap-1.5">
            <Badge tone={job.status === "open" ? "success" : "neutral"} className="capitalize">
              {job.status}
            </Badge>
            <Badge tone={JD_STATUS_TONE[job.jd_status]}>{JD_STATUS_LABEL[job.jd_status]}</Badge>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setScreeningOpen(true)}
              disabled={job.jd_status !== "APPROVED"}
              title={job.jd_status !== "APPROVED" ? "Approve the JD before screening" : undefined}
            >
              <Sparkles className="h-3.5 w-3.5" />
              Run Screening
            </Button>
            <Button
              size="sm"
              onClick={() => setPublishOpen(true)}
              disabled={job.jd_status !== "APPROVED"}
              title={job.jd_status !== "APPROVED" ? "Approve the JD before publishing" : undefined}
            >
              <Send className="h-3.5 w-3.5" />
              Publish Job
            </Button>
          </div>
        </div>
      </div>

      <PublishJobModal
        key={publishOpen ? job.id : "closed"}
        open={publishOpen}
        onClose={() => setPublishOpen(false)}
        job={job}
        onPublished={() => router.refresh()}
      />

      <RunScreeningModal
        key={screeningOpen ? `${job.id}-screening` : "closed"}
        open={screeningOpen}
        onClose={() => setScreeningOpen(false)}
        jobId={job.id}
        applications={applications}
        onComplete={() => router.refresh()}
      />

      <div className="mb-6 flex gap-1 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "relative px-3.5 py-2.5 text-sm font-medium transition-colors duration-[var(--duration-fast)]",
              tab === t ? "text-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {t}
            {tab === t && <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-accent" />}
          </button>
        ))}
      </div>

      {tab === "Overview" && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          <StatBox label="Total Applications" value={applications.length} />
          <StatBox label="Shortlisted" value={counts.SHORTLISTED ?? 0} />
          <StatBox label="Needs Review" value={counts.NEEDS_REVIEW ?? 0} />
          <StatBox label="Rejected" value={counts.REJECTED ?? 0} />
          <StatBox label="Selected" value={counts.SELECTED ?? 0} />
          <div className="col-span-full rounded-[var(--radius-lg)] border border-border bg-surface p-5">
            <h3 className="mb-2 text-sm font-semibold text-foreground">Snapshot</h3>
            <p className="text-sm text-muted-foreground">{job.description}</p>
          </div>
          <PostingsPanel jobId={job.id} postings={jobPostings} onSynced={() => router.refresh()} />
          <AssessmentPanel jobId={job.id} jdApproved={job.jd_status === "APPROVED"} assessment={assessment} stats={assessmentStats} />
        </div>
      )}

      {tab === "JD" &&
        (!job.description ? (
          <EmptyState title="No job description yet" description="This job doesn't have a generated JD." />
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="flex flex-col gap-4 lg:col-span-2">
              <JdSection title="About the Role">
                <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">{job.description}</p>
              </JdSection>

              {job.responsibilities.length > 0 && (
                <JdSection title="Responsibilities">
                  <ul className="list-disc space-y-1.5 pl-4 text-sm text-muted-foreground">
                    {job.responsibilities.map((r) => (
                      <li key={r}>{r}</li>
                    ))}
                  </ul>
                </JdSection>
              )}

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {job.required_skills.length > 0 && (
                  <JdSection title="Required Skills">
                    <div className="flex flex-wrap gap-1.5">
                      {job.required_skills.map((s) => (
                        <Badge key={s} tone="accent">
                          {s}
                        </Badge>
                      ))}
                    </div>
                  </JdSection>
                )}
                {job.preferred_skills.length > 0 && (
                  <JdSection title="Preferred Skills">
                    <div className="flex flex-wrap gap-1.5">
                      {job.preferred_skills.map((s) => (
                        <Badge key={s} tone="info">
                          {s}
                        </Badge>
                      ))}
                    </div>
                  </JdSection>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-4">
              <JdSection title="Role Details">
                <dl className="flex flex-col gap-2.5 text-sm">
                  <Fact label="Experience" value={`${job.experience_min}–${job.experience_max} yrs`} />
                  <Fact label="Education" value={job.education || "Not specified"} />
                  <Fact label="Work Mode" value={job.work_mode ?? "Not specified"} />
                  <Fact label="Employment Type" value={job.employment_type.replace("_", "-")} />
                  <Fact label="Openings" value={String(job.number_of_openings)} />
                  {job.salary_range && <Fact label="Salary Range" value={job.salary_range} />}
                </dl>
              </JdSection>

              {job.screening_criteria && (
                <JdSection title="Screening Criteria">
                  <p className="mb-1.5 text-xs font-medium text-muted-foreground">Mandatory</p>
                  <div className="mb-3 flex flex-wrap gap-1.5">
                    {job.screening_criteria.mandatory.map((s) => (
                      <Badge key={s.skill} tone="accent">
                        {s.skill} · {s.importance}
                      </Badge>
                    ))}
                  </div>
                  <p className="mb-1.5 text-xs font-medium text-muted-foreground">Preferred</p>
                  <div className="flex flex-wrap gap-1.5">
                    {job.screening_criteria.preferred.map((s) => (
                      <Badge key={s.skill} tone="info">
                        {s.skill} · {s.importance}
                      </Badge>
                    ))}
                  </div>
                </JdSection>
              )}
            </div>
          </div>
        ))}

      {tab === "Candidates" &&
        (rows.length === 0 ? (
          <EmptyState title="No candidates yet" description="Applications will appear here once candidates apply." />
        ) : (
          <CandidateTable rows={rows} />
        ))}

      {tab === "Pipeline" && (
        <div className="flex flex-col gap-5">
          <Pipeline
            counts={counts}
            activeStage={stageFilter ?? undefined}
            onSelectStage={(s) => setStageFilter((prev) => (prev === s ? null : s))}
          />
          {stageFilter &&
            (rows.length === 0 ? (
              <EmptyState title={`No candidates in this stage`} />
            ) : (
              <CandidateTable rows={rows} />
            ))}
        </div>
      )}

      {tab === "Activity" && (
        <div className="flex flex-col gap-4">
          {postingActivity.length > 0 && (
            <div className="rounded-[var(--radius-lg)] border border-border bg-surface p-2">
              <p className="px-2 pt-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Job Posting Agent
              </p>
              <ul className="flex flex-col gap-1 p-2">
                {postingActivity.map((posting) => (
                  <li key={posting.id} className="flex items-start justify-between gap-3 rounded-[var(--radius-md)] px-2 py-2 hover:bg-surface-elevated">
                    <span className="text-sm text-foreground">
                      {posting.platform} posting {posting.status.toLowerCase()}
                      {posting.last_error && <span className="text-danger"> — {posting.last_error}</span>}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {new Date(posting.updated_at).toLocaleString()}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {activity.length === 0 ? (
            <EmptyState title="No activity yet" description="Stage changes for this job's candidates will show up here." />
          ) : (
            <div className="rounded-[var(--radius-lg)] border border-border bg-surface p-2">
              <p className="px-2 pt-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Application System
              </p>
              <ActivityFeed entries={activity} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StatBox({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-border bg-surface p-5">
      <p className="text-2xl font-semibold tabular-nums text-foreground">{value}</p>
      <p className="mt-1 text-sm text-muted-foreground">{label}</p>
    </div>
  );
}

function JdSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-border bg-surface p-5">
      <h3 className="mb-3 text-sm font-semibold text-foreground">{title}</h3>
      {children}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right capitalize text-foreground">{value}</dd>
    </div>
  );
}
