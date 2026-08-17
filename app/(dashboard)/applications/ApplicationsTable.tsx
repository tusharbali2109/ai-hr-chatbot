"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ApplicationWithRelations } from "@/lib/services/applications";
import { RECRUITMENT_STAGES, STAGE_META, type RecruitmentStage } from "@/lib/stages";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/ui/Toast";
import { updateApplicationStageAction } from "@/lib/actions/applications";
import { EmptyState } from "@/components/ui/EmptyState";

export function ApplicationsTable({ applications }: { applications: ApplicationWithRelations[] }) {
  const [rows, setRows] = useState(applications);
  const [isPending, startTransition] = useTransition();
  const { showToast } = useToast();
  const router = useRouter();

  function onStageChange(applicationId: string, fromStage: RecruitmentStage, toStage: RecruitmentStage) {
    setRows((prev) => prev.map((a) => (a.id === applicationId ? { ...a, current_stage: toStage } : a)));

    startTransition(async () => {
      try {
        await updateApplicationStageAction(applicationId, fromStage, toStage);
        showToast(`Moved to ${STAGE_META[toStage].label}`, "success");
        router.refresh();
      } catch (err) {
        setRows((prev) => prev.map((a) => (a.id === applicationId ? { ...a, current_stage: fromStage } : a)));
        showToast(err instanceof Error ? err.message : "Failed to update stage", "danger");
      }
    });
  }

  if (rows.length === 0) {
    return <EmptyState title="No applications yet" description="Applications will appear here once candidates apply to a job." />;
  }

  return (
    <div className="overflow-x-auto scrollbar-thin rounded-[var(--radius-lg)] border border-border">
      <table className="w-full min-w-[920px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border bg-surface text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th className="px-4 py-3 font-medium">Candidate</th>
            <th className="px-4 py-3 font-medium">Job</th>
            <th className="px-4 py-3 font-medium">Stage</th>
            <th className="px-4 py-3 font-medium">Score</th>
            <th className="px-4 py-3 font-medium">Applied</th>
            <th className="px-4 py-3 font-medium">Source</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((app) => (
            <tr key={app.id} className="border-b border-border-subtle last:border-0 hover:bg-surface/60">
              <td className="px-4 py-3">
                <Link href={`/candidates/${app.candidate.id}`} className="font-medium text-foreground hover:text-accent">
                  {app.candidate.name}
                </Link>
                <p className="text-xs text-muted-foreground">{app.candidate.email}</p>
              </td>
              <td className="px-4 py-3">
                <Link href={`/jobs/${app.job.id}`} className="text-foreground hover:text-accent">
                  {app.job.title}
                </Link>
              </td>
              <td className="px-4 py-3">
                <Select
                  value={app.current_stage}
                  disabled={isPending}
                  onChange={(e) =>
                    onStageChange(app.id, app.current_stage, e.target.value as RecruitmentStage)
                  }
                  className="w-56"
                >
                  {RECRUITMENT_STAGES.map((stage) => (
                    <option key={stage} value={stage}>
                      {STAGE_META[stage].label}
                    </option>
                  ))}
                </Select>
              </td>
              <td className="px-4 py-3 tabular-nums text-foreground">
                {app.overall_score != null ? `${app.overall_score}%` : "—"}
              </td>
              <td className="px-4 py-3 text-muted-foreground">
                {new Date(app.applied_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
              </td>
              <td className="px-4 py-3 capitalize text-muted-foreground">{app.source.replace("_", " ")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
