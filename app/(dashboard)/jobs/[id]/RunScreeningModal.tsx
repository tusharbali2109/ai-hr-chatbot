"use client";

import { useState } from "react";
import { CheckCircle2, XCircle, Loader2, Sparkles } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Toast";
import type { ApplicationWithRelations } from "@/lib/services/applications";
import { screenApplicationAction } from "@/lib/actions/screening";
import type { ScreenResult } from "@/lib/screening/agent";

type Step = "select" | "confirm" | "running" | "results";

const BATCH_WARNING_THRESHOLD = 20;

export function RunScreeningModal({
  open,
  onClose,
  jobId,
  applications,
  onComplete,
}: {
  open: boolean;
  onClose: () => void;
  jobId: string;
  applications: ApplicationWithRelations[];
  onComplete: () => void;
}) {
  const { showToast } = useToast();
  const eligible = applications.filter((a) => a.current_stage === "APPLIED" || a.current_stage === "AI_SCREENING");

  // Parent remounts this component (key={open ? job.id : "closed"}) each
  // time the modal opens, so these initial values are fresh per-open — no
  // reset-on-open effect needed.
  const [step, setStep] = useState<Step>("select");
  const [selected, setSelected] = useState<Set<string>>(() => new Set(eligible.map((a) => a.id)));
  const [results, setResults] = useState<(ScreenResult & { candidateName: string })[]>([]);
  const [progress, setProgress] = useState(0);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleRun() {
    setStep("running");
    const targets = applications.filter((a) => selected.has(a.id));
    const collected: (ScreenResult & { candidateName: string })[] = [];

    for (let i = 0; i < targets.length; i++) {
      const app = targets[i];
      try {
        const result = await screenApplicationAction(app.id, jobId);
        collected.push({ ...result, candidateName: app.candidate.name });
      } catch (err) {
        collected.push({
          status: "FAILED",
          applicationId: app.id,
          error: err instanceof Error ? err.message : "Screening failed.",
          candidateName: app.candidate.name,
        });
      }
      setProgress(i + 1);
      setResults([...collected]);
    }

    onComplete();
    const failed = collected.filter((r) => r.status === "FAILED").length;
    showToast(
      failed === 0 ? `Screened ${collected.length} candidate(s).` : `${failed} of ${collected.length} screenings failed — see details.`,
      failed === 0 ? "success" : "danger"
    );
    setStep("results");
  }

  return (
    <Modal open={open} onClose={onClose} title="Run AI Screening" className="max-w-xl">
      {step === "select" && (
        <div className="flex flex-col gap-4">
          {eligible.length === 0 ? (
            <p className="text-sm text-muted-foreground">No applications are currently eligible for screening (must be APPLIED or AI_SCREENING).</p>
          ) : (
            <div className="max-h-72 overflow-y-auto scrollbar-thin flex flex-col gap-1.5">
              {eligible.map((a) => (
                <label
                  key={a.id}
                  className="flex cursor-pointer items-center gap-3 rounded-[var(--radius-md)] border border-border p-2.5 hover:border-[color-mix(in_srgb,var(--accent)_40%,var(--border))]"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(a.id)}
                    onChange={() => toggle(a.id)}
                    className="h-4 w-4 rounded border-border accent-[var(--accent)]"
                  />
                  <span className="flex-1 text-sm text-foreground">{a.candidate.name}</span>
                  <Badge tone="neutral">{a.current_stage}</Badge>
                </label>
              ))}
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={() => setStep("confirm")} disabled={selected.size === 0}>
              Continue ({selected.size})
            </Button>
          </div>
        </div>
      )}

      {step === "confirm" && (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            This will run {selected.size} AI screening{selected.size === 1 ? "" : "s"} sequentially, one at a time. Keep this
            tab open until it finishes.
          </p>
          {selected.size > BATCH_WARNING_THRESHOLD && (
            <div className="rounded-[var(--radius-md)] border border-warning/30 bg-warning/10 p-3 text-sm text-warning">
              You&apos;re about to screen {selected.size} candidates in one batch — this may take a while.
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setStep("select")}>
              Back
            </Button>
            <Button onClick={handleRun}>Start Screening</Button>
          </div>
        </div>
      )}

      {step === "running" && (
        <div className="flex flex-col items-center gap-3 py-8">
          <Loader2 className="h-5 w-5 animate-spin text-accent" />
          <p className="text-sm text-muted-foreground">
            Screening {progress} of {selected.size}…
          </p>
        </div>
      )}

      {step === "results" && (
        <div className="flex flex-col gap-4">
          <div className="flex max-h-80 flex-col gap-2 overflow-y-auto scrollbar-thin">
            {results.map((r) => (
              <div key={r.applicationId} className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-border p-3">
                <div className="flex items-center gap-2.5">
                  {r.status === "COMPLETED" ? (
                    <CheckCircle2 className="h-4 w-4 text-success" />
                  ) : (
                    <XCircle className="h-4 w-4 text-danger" />
                  )}
                  <div>
                    <p className="text-sm font-medium text-foreground">{r.candidateName}</p>
                    <p className="text-xs text-muted-foreground">
                      {r.status === "COMPLETED" ? `${r.recommendation} — score ${r.overallScore}` : r.error}
                    </p>
                  </div>
                </div>
                {r.status === "COMPLETED" && r.recommendation && (
                  <Badge tone={r.recommendation === "SHORTLISTED" ? "success" : r.recommendation === "NEEDS_REVIEW" ? "warning" : "danger"}>
                    <Sparkles className="h-3 w-3" />
                    {r.recommendation}
                  </Badge>
                )}
              </div>
            ))}
          </div>
          <div className="flex justify-end">
            <Button onClick={onClose}>Done</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
