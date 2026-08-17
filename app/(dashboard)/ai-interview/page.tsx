import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { listLatestInterviewSummaries } from "@/lib/services/interviews";
import { listLatestRecommendations } from "@/lib/services/screening";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Sparkles } from "lucide-react";

const QUEUE_STAGES = ["SHORTLISTED", "AI_INTERVIEW", "INTERVIEW_SHORTLISTED"] as const;

const STATUS_TONE: Record<string, "neutral" | "info" | "success" | "warning" | "danger"> = {
  QUEUED: "neutral",
  DIALING: "info",
  IN_PROGRESS: "info",
  COMPLETED: "success",
  NO_ANSWER: "warning",
  BUSY: "warning",
  CALL_FAILED: "danger",
  NETWORK_ERROR: "danger",
  PROVIDER_ERROR: "danger",
  CANDIDATE_DISCONNECTED: "warning",
  CONSENT_DECLINED: "neutral",
  NEEDS_REVIEW: "warning",
};

const RECOMMENDATION_TONE: Record<string, "success" | "warning" | "danger"> = {
  INTERVIEW_SHORTLISTED: "success",
  NEEDS_REVIEW: "warning",
  REJECTED: "danger",
};

export default async function AiInterviewQueuePage() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("applications")
    .select("id, current_stage, applied_at, candidate:candidates(id, name, email), job:jobs(id, title)")
    .in("current_stage", QUEUE_STAGES)
    .order("applied_at", { ascending: false });
  if (error) throw error;

  const applicationIds = (data ?? []).map((row) => row.id as string);
  const [interviewSummaries, screeningSummaries] = await Promise.all([
    listLatestInterviewSummaries(applicationIds),
    listLatestRecommendations(applicationIds),
  ]);

  const rows = (data ?? []).map((row) => {
    const candidate = row.candidate as unknown as { id: string; name: string; email: string };
    const job = row.job as unknown as { id: string; title: string };
    const interview = interviewSummaries.get(row.id as string);
    const screening = screeningSummaries.get(row.id as string);
    return {
      applicationId: row.id as string,
      candidateId: candidate.id,
      candidateName: candidate.name,
      candidateEmail: candidate.email,
      jobTitle: job.title,
      currentStage: row.current_stage as string,
      screeningScore: screening?.overallScore ?? null,
      interviewStatus: interview?.status ?? "READY",
      interviewScore: interview?.overall_score ?? null,
      recommendation: interview?.recommendation ?? null,
    };
  });

  const counts = rows.reduce<Record<string, number>>((acc, r) => {
    acc[r.interviewStatus] = (acc[r.interviewStatus] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <div className="mb-6 flex items-center gap-2.5">
        <Sparkles className="h-5 w-5 text-accent" />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">AI Interviews</h1>
          <p className="mt-1 text-sm text-muted-foreground">Shortlisted candidates ready for, in progress with, or completed by the AI Interview Agent.</p>
        </div>
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        {Object.entries(counts).map(([status, count]) => (
          <Badge key={status} tone={STATUS_TONE[status] ?? "neutral"}>
            {status.replace(/_/g, " ")}: {count}
          </Badge>
        ))}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="No candidates in the interview queue yet"
          description="Shortlisted candidates from AI Screening will appear here once ready for an AI interview."
        />
      ) : (
        <div className="overflow-x-auto scrollbar-thin rounded-[var(--radius-lg)] border border-border">
          <table className="w-full min-w-[900px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-surface text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-medium">Candidate</th>
                <th className="px-4 py-3 font-medium">Job</th>
                <th className="px-4 py-3 font-medium">Screening Score</th>
                <th className="px-4 py-3 font-medium">Interview Status</th>
                <th className="px-4 py-3 font-medium">Interview Score</th>
                <th className="px-4 py-3 font-medium">Recommendation</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.applicationId} className="border-b border-border-subtle last:border-0 hover:bg-surface/60">
                  <td className="px-4 py-3">
                    <Link href={`/candidates/${row.candidateId}`} className="font-medium text-foreground hover:text-accent">
                      {row.candidateName}
                    </Link>
                    <span className="block text-xs text-muted-foreground">{row.candidateEmail}</span>
                  </td>
                  <td className="px-4 py-3 text-foreground">{row.jobTitle}</td>
                  <td className="px-4 py-3 tabular-nums text-foreground">{row.screeningScore != null ? `${row.screeningScore}%` : "—"}</td>
                  <td className="px-4 py-3">
                    <Badge tone={STATUS_TONE[row.interviewStatus] ?? "neutral"}>{row.interviewStatus.replace(/_/g, " ")}</Badge>
                  </td>
                  <td className="px-4 py-3 tabular-nums text-foreground">{row.interviewScore != null ? `${row.interviewScore}%` : "—"}</td>
                  <td className="px-4 py-3">
                    {row.recommendation ? (
                      <Badge tone={RECOMMENDATION_TONE[row.recommendation] ?? "neutral"}>{row.recommendation}</Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/candidates/${row.candidateId}`} className="text-accent hover:underline">
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
