import Link from "next/link";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Badge } from "@/components/ui/Badge";
import type { RecruitmentStage } from "@/lib/stages";

export interface CandidateRow {
  applicationId: string;
  candidateId: string;
  name: string;
  email: string;
  jobTitle: string;
  stage: RecruitmentStage;
  score: number | null;
  appliedAt: string;
  source: string;
  sourcePlatform?: string | null;
  recommendation?: "SHORTLISTED" | "REJECTED" | "NEEDS_REVIEW" | null;
}

const RECOMMENDATION_TONE: Record<string, "success" | "warning" | "danger"> = {
  SHORTLISTED: "success",
  NEEDS_REVIEW: "warning",
  REJECTED: "danger",
};

function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function CandidateTable({ rows }: { rows: CandidateRow[] }) {
  return (
    <div className="overflow-x-auto scrollbar-thin rounded-[var(--radius-lg)] border border-border">
      <table className="w-full min-w-[960px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border bg-surface text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th className="px-4 py-3 font-medium">Candidate</th>
            <th className="px-4 py-3 font-medium">Position</th>
            <th className="px-4 py-3 font-medium">Stage</th>
            <th className="px-4 py-3 font-medium">AI Recommendation</th>
            <th className="px-4 py-3 font-medium">Score</th>
            <th className="px-4 py-3 font-medium">Applied</th>
            <th className="px-4 py-3 font-medium">Source</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.applicationId}
              className="border-b border-border-subtle last:border-0 hover:bg-surface/60"
            >
              <td className="px-4 py-3">
                <Link href={`/candidates/${row.candidateId}`} className="flex items-center gap-2.5">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/15 text-xs font-medium text-accent">
                    {initials(row.name)}
                  </span>
                  <span>
                    <span className="block font-medium text-foreground hover:text-accent">{row.name}</span>
                    <span className="block text-xs text-muted-foreground">{row.email}</span>
                  </span>
                </Link>
              </td>
              <td className="px-4 py-3 text-foreground">{row.jobTitle}</td>
              <td className="px-4 py-3">
                <StatusBadge stage={row.stage} />
              </td>
              <td className="px-4 py-3">
                {row.recommendation ? (
                  <Badge tone={RECOMMENDATION_TONE[row.recommendation]}>{row.recommendation}</Badge>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </td>
              <td className="px-4 py-3 tabular-nums text-foreground">
                {row.score != null ? `${row.score}%` : "—"}
              </td>
              <td className="px-4 py-3 text-muted-foreground">
                {new Date(row.appliedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
              </td>
              <td className="px-4 py-3 capitalize text-muted-foreground">
                {(row.sourcePlatform ?? row.source).replace("_", " ")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
