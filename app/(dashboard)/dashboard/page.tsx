import Link from "next/link";
import {
  Briefcase,
  Users,
  FileText,
  Bot,
  CheckCircle2,
  MessagesSquare,
  ClipboardCheck,
  Award,
  HelpCircle,
  XCircle,
  Gavel,
  Plus,
  UserPlus,
} from "lucide-react";
import { getDashboardStats, getRecentApplications, getRecentActivity } from "@/lib/services/dashboard";
import { createClient } from "@/lib/supabase/server";
import { StatCounter } from "@/components/recruitment/StatCounter";
import { Pipeline } from "@/components/recruitment/Pipeline";
import { CandidateTable, type CandidateRow } from "@/components/recruitment/CandidateTable";
import { ActivityFeed, type ActivityEntry } from "@/components/recruitment/ActivityFeed";
import { EmptyState } from "@/components/ui/EmptyState";
import { PIPELINE_STAGES, type RecruitmentStage } from "@/lib/stages";

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export default async function DashboardPage() {
  const [stats, recentApplications, recentActivity, supabase] = await Promise.all([
    getDashboardStats(),
    getRecentApplications(6),
    getRecentActivity(8),
    createClient(),
  ]);

  const { data: allStages } = await supabase.from("applications").select("current_stage");

  const pipelineCounts: Partial<Record<RecruitmentStage, number>> = {};
  for (const s of PIPELINE_STAGES) pipelineCounts[s] = 0;
  for (const row of allStages ?? []) {
    if ((PIPELINE_STAGES as string[]).includes(row.current_stage)) {
      const stage = row.current_stage as RecruitmentStage;
      pipelineCounts[stage] = (pipelineCounts[stage] ?? 0) + 1;
    }
  }

  const rows: CandidateRow[] = recentApplications.map((a) => ({
    applicationId: a.id,
    candidateId: a.candidate.id,
    name: a.candidate.name,
    email: a.candidate.email,
    jobTitle: a.job.title,
    stage: a.current_stage,
    score: a.overall_score,
    appliedAt: a.applied_at,
    source: a.source,
  }));

  const activity: ActivityEntry[] = recentActivity.map((h) => ({
    id: h.id,
    description: `${h.application.candidate.name} → ${h.application.job.title}`,
    toStage: h.to_stage,
    createdAt: h.created_at,
  }));

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
          {greeting()} <span aria-hidden>👋</span>
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">A live view of your hiring pipeline.</p>
      </div>

      {/* Quick actions — the two highest-frequency actions, one tap away, thumb-reachable on mobile. */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:hidden">
        <Link
          href="/jobs/new"
          className="flex items-center justify-center gap-2 rounded-[var(--radius-lg)] bg-accent px-4 py-3 text-sm font-medium text-accent-foreground shadow-[var(--shadow-soft)] active:scale-[0.98] transition-transform duration-[var(--duration-fast)]"
        >
          <Plus className="h-4 w-4" />
          Create Job
        </Link>
        <Link
          href="/candidates"
          className="flex items-center justify-center gap-2 rounded-[var(--radius-lg)] border border-border bg-surface px-4 py-3 text-sm font-medium text-foreground active:scale-[0.98] transition-transform duration-[var(--duration-fast)]"
        >
          <UserPlus className="h-4 w-4" />
          Add Candidate
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-6">
        <StatCounter label="Active Jobs" value={stats.activeJobs} icon={<Briefcase className="h-4 w-4" />} />
        <StatCounter label="Total Candidates" value={stats.totalCandidates} icon={<Users className="h-4 w-4" />} />
        <StatCounter label="Applications" value={stats.applications} icon={<FileText className="h-4 w-4" />} />
        <StatCounter label="Pending Screening" value={stats.pendingScreening} icon={<Bot className="h-4 w-4" />} />
        <StatCounter label="Shortlisted" value={stats.shortlisted} icon={<CheckCircle2 className="h-4 w-4" />} />
        <StatCounter label="Needs Review" value={stats.needsReview} icon={<HelpCircle className="h-4 w-4" />} />
        <StatCounter label="Rejected" value={stats.rejected} icon={<XCircle className="h-4 w-4" />} />
        <StatCounter label="Interviews" value={stats.interviews} icon={<MessagesSquare className="h-4 w-4" />} />
        <StatCounter label="Assessments" value={stats.assessments} icon={<ClipboardCheck className="h-4 w-4" />} />
        <StatCounter label="Final Review" value={stats.finalReview} icon={<Gavel className="h-4 w-4" />} />
        <StatCounter label="Selected" value={stats.selected} icon={<Award className="h-4 w-4" />} />
      </div>

      <div className="mt-8">
        <h2 className="mb-3 text-sm font-semibold text-foreground">Recruitment Pipeline</h2>
        <Pipeline counts={pipelineCounts} />
      </div>

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <h2 className="mb-3 text-sm font-semibold text-foreground">Recent Candidates</h2>
          {rows.length === 0 ? (
            <EmptyState title="No candidates yet" description="Seed demo data to populate the dashboard." />
          ) : (
            <CandidateTable rows={rows} />
          )}
        </div>
        <div>
          <h2 className="mb-3 text-sm font-semibold text-foreground">Recent Activity</h2>
          <div className="rounded-[var(--radius-lg)] border border-border bg-surface p-2">
            {activity.length === 0 ? <EmptyState title="No activity yet" /> : <ActivityFeed entries={activity} />}
          </div>
        </div>
      </div>
    </div>
  );
}
