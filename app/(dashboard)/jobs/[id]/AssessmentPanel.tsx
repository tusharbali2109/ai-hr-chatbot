"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Sparkles, ClipboardCheck } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { generateAssessmentAction } from "@/lib/actions/assessment";
import type { Assessment } from "@/lib/types/database";
import type { AssignmentStatCounts } from "@/lib/services/assessments";

const STATUS_TONE: Record<string, "neutral" | "info" | "success" | "warning" | "danger"> = {
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

export function AssessmentPanel({ jobId, jdApproved, assessment, stats }: { jobId: string; jdApproved: boolean; assessment: Assessment | null; stats: AssignmentStatCounts | null }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [generating, setGenerating] = useState(false);

  async function handleGenerate() {
    setGenerating(true);
    try {
      const { assessmentId } = await generateAssessmentAction(jobId);
      showToast("Assessment generated as a draft — review it before approving.", "success");
      router.push(`/assessments/${assessmentId}/builder`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to generate assessment.", "danger");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="col-span-full rounded-[var(--radius-lg)] border border-border bg-surface p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Assessment</h3>
        {assessment ? (
          <Link href={`/assessments/${assessment.id}/builder`}>
            <Button size="sm" variant="secondary">
              <ClipboardCheck className="h-3.5 w-3.5" />
              Open builder
            </Button>
          </Link>
        ) : (
          <Button size="sm" variant="secondary" onClick={handleGenerate} disabled={!jdApproved || generating}
            title={!jdApproved ? "Approve the JD before generating an assessment" : undefined}>
            <Sparkles className="h-3.5 w-3.5" />
            {generating ? "Generating…" : "Generate Assessment"}
          </Button>
        )}
      </div>

      {!assessment && <p className="text-sm text-muted-foreground">No assessment has been generated for this job yet.</p>}

      {assessment && (
        <>
          <div className="mb-4 flex items-center gap-2">
            <span className="text-sm font-medium text-foreground">{assessment.title}</span>
            <Badge tone={STATUS_TONE[assessment.status] ?? "neutral"}>{assessment.status}</Badge>
            <Badge tone="neutral">v{assessment.assessment_version}</Badge>
          </div>

          {stats && (
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
              <StatBox label="Assigned" value={stats.assigned} />
              <StatBox label="Submitted" value={stats.submitted} />
              <StatBox label="Pending" value={stats.pending} />
              <StatBox label="Evaluated" value={stats.evaluated} />
              <StatBox label="Shortlisted" value={stats.shortlisted} />
              <StatBox label="Needs Review" value={stats.needsReview} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

function StatBox({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[var(--radius-md)] border border-border-subtle p-3 text-center">
      <p className="text-lg font-semibold tabular-nums text-foreground">{value}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
