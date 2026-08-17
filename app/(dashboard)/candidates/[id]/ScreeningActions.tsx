"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { screenApplicationAction, overrideScreeningDecisionAction } from "@/lib/actions/screening";
import type { RecruitmentStage } from "@/lib/stages";

const RECOMMENDATION_TONE: Record<string, "success" | "warning" | "danger"> = {
  SHORTLISTED: "success",
  NEEDS_REVIEW: "warning",
  REJECTED: "danger",
};

export function ScreeningActions({
  applicationId,
  jobId,
  currentStage,
  recommendation,
  hasScreening,
}: {
  applicationId: string;
  jobId: string;
  currentStage: RecruitmentStage;
  recommendation: string | null;
  hasScreening: boolean;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [running, setRunning] = useState(false);
  const [overrideTarget, setOverrideTarget] = useState<"SHORTLISTED" | "REJECTED" | "NEEDS_REVIEW" | null>(null);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const isTerminal = currentStage === "AI_SCREENING" || currentStage === "APPLIED";

  async function handleRunScreening() {
    setRunning(true);
    try {
      const result = await screenApplicationAction(applicationId, jobId);
      if (result.status === "COMPLETED") {
        showToast(`Screening complete: ${result.recommendation} (score ${result.overallScore}).`, "success");
      } else {
        showToast(`Screening failed: ${result.error}`, "danger");
      }
      router.refresh();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to run screening.", "danger");
    } finally {
      setRunning(false);
    }
  }

  async function handleOverrideConfirm() {
    if (!overrideTarget) return;
    setSubmitting(true);
    try {
      await overrideScreeningDecisionAction(applicationId, jobId, overrideTarget, reason);
      showToast(`Stage overridden to ${overrideTarget}.`, "success");
      setOverrideTarget(null);
      setReason("");
      router.refresh();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to override decision.", "danger");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {recommendation && (
          <Badge tone={RECOMMENDATION_TONE[recommendation] ?? "neutral"}>AI Recommendation: {recommendation}</Badge>
        )}
        <Button size="sm" variant="secondary" onClick={handleRunScreening} disabled={running}>
          {hasScreening ? <RefreshCw className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5" />}
          {running ? "Screening…" : hasScreening ? "Re-screen" : "Run Screening"}
        </Button>
      </div>

      {!isTerminal || hasScreening ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Recruiter override:</span>
          <Button size="sm" variant="secondary" onClick={() => setOverrideTarget("SHORTLISTED")}>
            Shortlist
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setOverrideTarget("NEEDS_REVIEW")}>
            Needs Review
          </Button>
          <Button size="sm" variant="danger" onClick={() => setOverrideTarget("REJECTED")}>
            Reject
          </Button>
        </div>
      ) : null}

      <Modal open={overrideTarget != null} onClose={() => setOverrideTarget(null)} title={`Override to ${overrideTarget ?? ""}`}>
        <p className="text-sm text-muted-foreground">
          This will be recorded as a human decision, distinct from the AI recommendation. Provide a short reason.
        </p>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          placeholder="Why are you overriding the AI recommendation?"
          className="mt-3 w-full rounded-[var(--radius-md)] border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
        />
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setOverrideTarget(null)}>
            Cancel
          </Button>
          <Button onClick={handleOverrideConfirm} disabled={submitting || !reason.trim()}>
            Confirm Override
          </Button>
        </div>
      </Modal>
    </div>
  );
}
