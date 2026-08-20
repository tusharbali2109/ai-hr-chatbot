"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ClipboardCheck, Upload, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/ui/Toast";
import {
  assignAssessmentAction,
  overrideAssessmentDecisionAction,
  uploadOpenEndedSubmissionAction,
  regenerateOpenEndedReviewAction,
} from "@/lib/actions/assessment";
import { DEADLINE_PRESETS, formatDeadlineConfig, type DeadlineConfig } from "@/lib/assessment/logic";
import type { RecruitmentStage } from "@/lib/stages";
import type { AssessmentAssignment, AssessmentMode } from "@/lib/types/database";

function OpenEndedReviewPanel({ assignment, onRegenerated }: { assignment: AssessmentAssignment; onRegenerated: () => void }) {
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  async function handleFileSelected(file: File) {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.set("file", file);
      const result = await uploadOpenEndedSubmissionAction(assignment.id, formData);
      if (result.reviewGenerated) {
        showToast("Submission uploaded and reviewed.", "success");
      } else {
        showToast(result.error ?? "Submission uploaded, but the AI review failed — try regenerating it.", "danger");
      }
      onRegenerated();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to upload submission.", "danger");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleRegenerate() {
    setRegenerating(true);
    try {
      const result = await regenerateOpenEndedReviewAction(assignment.id);
      if (result.reviewGenerated) showToast("Review regenerated.", "success");
      else showToast(result.error ?? "Failed to regenerate the review.", "danger");
      onRegenerated();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to regenerate the review.", "danger");
    } finally {
      setRegenerating(false);
    }
  }

  const review = assignment.ai_review;

  return (
    <div className="flex flex-col gap-3 rounded-[var(--radius-md)] border border-border bg-surface-elevated p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-foreground">
          {assignment.submission_file_path ? "Candidate submission" : "No submission uploaded yet"}
        </p>
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.docx,.txt,.md"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFileSelected(file);
            }}
          />
          <Button size="sm" variant="secondary" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
            <Upload className="h-3.5 w-3.5" />
            {uploading ? "Uploading…" : assignment.submission_file_path ? "Replace submission" : "Upload submission"}
          </Button>
          {review && (
            <Button size="sm" variant="secondary" onClick={handleRegenerate} disabled={regenerating}>
              <Sparkles className="h-3.5 w-3.5" />
              {regenerating ? "Reviewing…" : "Regenerate review"}
            </Button>
          )}
        </div>
      </div>

      {!assignment.submission_file_path && (
        <p className="text-xs text-muted-foreground">
          Upload the candidate&apos;s completed work (received outside the platform, e.g. by email) — the AI review generates automatically.
        </p>
      )}

      {review && (
        <div className="mt-1 flex flex-col gap-4 text-sm">
          <ReviewSection title="Strengths" items={review.strengths} tone="success" />
          <ReviewSection title="Weaknesses" items={review.weaknesses} tone="danger" />
          <ReviewSection title="Focus areas" items={review.focus_areas} tone="warning" />
          <ReviewSection title="Gaps vs. the brief" items={review.gaps} tone="danger" />
          <ReviewSection title="Suggested interviewer questions" items={review.interviewer_questions} tone="accent" />
          <ReviewSection title="Where they may get stuck" items={review.stuck_points} tone="info" />
          {review.authenticity_notes && (
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Worth a closer look</p>
              <p className="text-sm text-muted-foreground">{review.authenticity_notes}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ReviewSection({ title, items, tone }: { title: string; items: string[]; tone: "success" | "danger" | "warning" | "accent" | "info" }) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      <ul className="flex flex-col gap-1.5">
        {items.map((item, i) => (
          <li key={i} className="flex gap-2">
            <Badge tone={tone} className="mt-0.5 shrink-0">
              {i + 1}
            </Badge>
            <span className="text-muted-foreground">{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

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
  assessmentType,
}: {
  applicationId: string;
  jobId: string;
  currentStage: RecruitmentStage;
  hasReadyAssessment: boolean;
  assignment: AssessmentAssignment | null;
  assessmentType: AssessmentMode | null;
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

      {assessmentType === "OPEN_ENDED" && assignment && assignment.status !== "CANCELLED" && (
        <OpenEndedReviewPanel assignment={assignment} onRegenerated={() => router.refresh()} />
      )}

      {(assignment?.status === "COMPLETED" || (assessmentType === "OPEN_ENDED" && assignment?.submission_file_path)) && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Recruiter decision:</span>
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
