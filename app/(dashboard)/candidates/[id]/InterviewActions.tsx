"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PhoneCall, RefreshCw, Video } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import {
  triggerInterviewAction,
  retryInterviewAction,
  overrideInterviewDecisionAction,
  startBrowserInterviewAction,
} from "@/lib/actions/interview";
import type { RecruitmentStage } from "@/lib/stages";

const RECOMMENDATION_TONE: Record<string, "success" | "warning" | "danger"> = {
  INTERVIEW_SHORTLISTED: "success",
  NEEDS_REVIEW: "warning",
  REJECTED: "danger",
};

export function InterviewActions({
  applicationId,
  jobId,
  currentStage,
  recommendation,
  hasInterview,
  canRetry,
}: {
  applicationId: string;
  jobId: string;
  currentStage: RecruitmentStage;
  recommendation: string | null;
  hasInterview: boolean;
  canRetry: boolean;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [running, setRunning] = useState(false);
  const [sendingVideo, setSendingVideo] = useState(false);
  const [overrideTarget, setOverrideTarget] = useState<"INTERVIEW_SHORTLISTED" | "REJECTED" | "NEEDS_REVIEW" | null>(null);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const eligible = currentStage === "SHORTLISTED";
  const canTrigger = eligible && !hasInterview;

  async function handleTrigger() {
    setRunning(true);
    try {
      const result = await triggerInterviewAction(applicationId, jobId);
      if (result.completedSynchronously) {
        showToast(`Interview complete: ${result.recommendation ?? result.status} (score ${result.overallScore ?? "—"}).`, "success");
      } else {
        showToast("Call placed — check back shortly for results once the call completes.", "info");
      }
      router.refresh();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to trigger interview.", "danger");
    } finally {
      setRunning(false);
    }
  }

  async function handleSendVideoInterview() {
    setSendingVideo(true);
    try {
      await startBrowserInterviewAction(applicationId, jobId);
      showToast("Video interview link emailed to the candidate.", "success");
      router.refresh();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to send the video interview.", "danger");
    } finally {
      setSendingVideo(false);
    }
  }

  async function handleRetry() {
    setRunning(true);
    try {
      const result = await retryInterviewAction(applicationId, jobId);
      if (result.completedSynchronously) {
        showToast(`Interview complete: ${result.recommendation ?? result.status} (score ${result.overallScore ?? "—"}).`, "success");
      } else {
        showToast("Retry call placed — check back shortly.", "info");
      }
      router.refresh();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to retry interview.", "danger");
    } finally {
      setRunning(false);
    }
  }

  async function handleOverrideConfirm() {
    if (!overrideTarget) return;
    setSubmitting(true);
    try {
      await overrideInterviewDecisionAction(applicationId, jobId, overrideTarget, reason);
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
        {canTrigger && (
          <Button size="sm" variant="secondary" onClick={handleTrigger} disabled={running}>
            <PhoneCall className="h-3.5 w-3.5" />
            {running ? "Calling…" : "Run AI Phone Interview"}
          </Button>
        )}
        {canTrigger && (
          <Button size="sm" variant="secondary" onClick={handleSendVideoInterview} disabled={sendingVideo}>
            <Video className="h-3.5 w-3.5" />
            {sendingVideo ? "Sending…" : "Send AI Video Interview"}
          </Button>
        )}
        {canRetry && (
          <Button size="sm" variant="secondary" onClick={handleRetry} disabled={running}>
            <RefreshCw className="h-3.5 w-3.5" />
            {running ? "Calling…" : "Retry Call"}
          </Button>
        )}
        {!eligible && !hasInterview && (
          <span className="text-xs text-muted-foreground">Only shortlisted candidates are eligible for an AI interview.</span>
        )}
      </div>

      {hasInterview && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Recruiter override:</span>
          <Button size="sm" variant="secondary" onClick={() => setOverrideTarget("INTERVIEW_SHORTLISTED")}>
            Shortlist
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setOverrideTarget("NEEDS_REVIEW")}>
            Needs Review
          </Button>
          <Button size="sm" variant="danger" onClick={() => setOverrideTarget("REJECTED")}>
            Reject
          </Button>
        </div>
      )}

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
