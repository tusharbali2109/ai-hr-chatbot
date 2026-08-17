"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ClipboardCheck } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/ui/Toast";
import { assignAssessmentAction, overrideAssessmentDecisionAction } from "@/lib/actions/assessment";
import { DEADLINE_PRESETS, formatDeadlineConfig, type DeadlineConfig } from "@/lib/assessment/logic";
import type { RecruitmentStage } from "@/lib/stages";
import type { AssessmentAssignment } from "@/lib/types/database";

const RECOMMENDATION_TONE: Record<string, "success" | "warning" | "danger"> = {
  SHORTLIST: "success",
  NEEDS_REVIEW: "warning",
  REJECT: "danger",
};

export function AssessmentActions({
  applicationId,
  jobId,
  currentStage,
  hasReadyAssessment,
  assignment,
}: {
  applicationId: string;
  jobId: string;
  currentStage: RecruitmentStage;
  hasReadyAssessment: boolean;
  assignment: AssessmentAssignment | null;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [assignOpen, setAssignOpen] = useState(false);
  const [deadlinePreset, setDeadlinePreset] = useState(2); // "72 hours"
  const [assigning, setAssigning] = useState(false);
  const [overrideTarget, setOverrideTarget] = useState<"ASSESSMENT_SHORTLISTED" | "REJECTED" | "NEEDS_REVIEW" | null>(null);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const eligible = currentStage === "INTERVIEW_SHORTLISTED";
  const hasActiveOrPastAssignment = assignment != null && assignment.status !== "CANCELLED";
  const canAssign = eligible && !hasActiveOrPastAssignment && hasReadyAssessment;

  async function handleAssign() {
    setAssigning(true);
    try {
      const config: DeadlineConfig = DEADLINE_PRESETS[deadlinePreset].config;
      await assignAssessmentAction(applicationId, config);
      showToast("Assessment assigned to candidate.", "success");
      setAssignOpen(false);
      router.refresh();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to assign assessment.", "danger");
    } finally {
      setAssigning(false);
    }
  }

  async function handleOverrideConfirm() {
    if (!overrideTarget) return;
    setSubmitting(true);
    try {
      await overrideAssessmentDecisionAction(applicationId, jobId, overrideTarget, reason);
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
        {assignment?.status && <Badge tone="info">Status: {assignment.status.replace(/_/g, " ")}</Badge>}
        {assignment?.score != null && <Badge tone="accent">Score: {assignment.score}%</Badge>}
        {assignment?.recommendation && (
          <Badge tone={RECOMMENDATION_TONE[assignment.recommendation] ?? "neutral"}>AI Recommendation: {assignment.recommendation}</Badge>
        )}
        {canAssign && (
          <Button size="sm" variant="secondary" onClick={() => setAssignOpen(true)}>
            <ClipboardCheck className="h-3.5 w-3.5" />
            Send Assessment
          </Button>
        )}
        {!eligible && !hasActiveOrPastAssignment && (
          <span className="text-xs text-muted-foreground">Only candidates who passed the AI interview are eligible.</span>
        )}
        {eligible && !hasActiveOrPastAssignment && !hasReadyAssessment && (
          <span className="text-xs text-muted-foreground">This job has no approved assessment yet — build one from the Assessments page.</span>
        )}
      </div>

      {assignment?.status === "COMPLETED" && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Recruiter override:</span>
          <Button size="sm" variant="secondary" onClick={() => setOverrideTarget("ASSESSMENT_SHORTLISTED")}>
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

      <Modal open={assignOpen} onClose={() => setAssignOpen(false)} title="Send Assessment">
        <p className="text-sm text-muted-foreground">Choose how long the candidate has to complete the assessment.</p>
        <div className="mt-3">
          <Select value={String(deadlinePreset)} onChange={(e) => setDeadlinePreset(Number(e.target.value))}>
            {DEADLINE_PRESETS.map((preset, i) => (
              <option key={preset.label} value={i}>
                {preset.label}
              </option>
            ))}
          </Select>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Deadline: {formatDeadlineConfig(DEADLINE_PRESETS[deadlinePreset].config)} from now.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setAssignOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleAssign} disabled={assigning}>
            {assigning ? "Sending…" : "Send"}
          </Button>
        </div>
      </Modal>

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
