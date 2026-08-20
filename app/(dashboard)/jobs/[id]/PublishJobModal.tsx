"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, AlertTriangle, XCircle, Loader2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Toast";
import type { Job } from "@/lib/types/database";
import type { PublishResult } from "@/lib/jobboards/agent";
import {
  checkPlatformChecklistAction,
  publishJobAction,
  retryPublishAction,
  type PlatformChecklistItem,
} from "@/lib/actions/jobboards";

type Step = "loading" | "checklist" | "preview" | "publishing" | "results";

const PLATFORM_LABEL: Record<string, string> = {
  mock: "Mock Job Board",
  linkedin: "LinkedIn",
  naukri: "Naukri",
  indeed: "Indeed",
};

export function PublishJobModal({
  open,
  onClose,
  job,
  onPublished,
}: {
  open: boolean;
  onClose: () => void;
  job: Job;
  onPublished: () => void;
}) {
  const { showToast } = useToast();
  const [step, setStep] = useState<Step>("loading");
  const [checklist, setChecklist] = useState<PlatformChecklistItem[]>([]);
  const [jobErrors, setJobErrors] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [results, setResults] = useState<PublishResult[]>([]);

  useEffect(() => {
    if (!open) return;
    checkPlatformChecklistAction(job.id)
      .then((res) => {
        setJobErrors(res.jobErrors);
        setChecklist(res.platforms);
        setSelected(new Set(res.platforms.filter((p) => p.available && p.connected).map((p) => p.platform)));
        setStep("checklist");
      })
      .catch((err) => {
        showToast(err instanceof Error ? err.message : "Failed to load publish checklist.", "danger");
        onClose();
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, job.id]);

  function toggle(platform: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(platform)) next.delete(platform);
      else next.add(platform);
      return next;
    });
  }

  async function handlePublish() {
    setStep("publishing");
    try {
      const { results: publishResults } = await publishJobAction(job.id, Array.from(selected));
      setResults(publishResults);
      setStep("results");
      onPublished();
      const failed = publishResults.filter((r) => r.status === "FAILED").length;
      if (failed === 0) showToast(`Published to ${publishResults.length} platform(s).`, "success");
      else showToast(`${failed} platform(s) failed to publish — see details.`, "danger");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Publishing failed.", "danger");
      setStep("checklist");
    }
  }

  async function handleRetry(platform: string) {
    try {
      const result = await retryPublishAction(job.id, platform);
      setResults((prev) => prev.map((r) => (r.platform === platform ? result : r)));
      onPublished();
      showToast(result.status === "PUBLISHED" ? `Retried — published to ${PLATFORM_LABEL[platform] ?? platform}.` : "Retry failed again — see error.", result.status === "PUBLISHED" ? "success" : "danger");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Retry failed.", "danger");
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Publish Job" className="max-w-xl">
      {step === "loading" && (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Checking platform connections…
        </div>
      )}

      {step === "checklist" && (
        <div className="flex flex-col gap-4">
          <p className="rounded-[var(--radius-md)] border border-border bg-surface p-3 text-xs text-muted-foreground">
            This job is already live on your own <span className="font-medium text-foreground">Careers page</span> — no publishing needed for that. The platforms below are for posting out to external job boards.
          </p>

          {jobErrors.length > 0 && (
            <div className="rounded-[var(--radius-md)] border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
              <p className="font-medium">This job can&apos;t be published yet:</p>
              <ul className="mt-1 list-disc pl-4">
                {jobErrors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-col gap-2">
            {checklist.map((item) => (
              <PlatformChecklistRow
                key={item.platform}
                item={item}
                checked={selected.has(item.platform)}
                onToggle={() => toggle(item.platform)}
              />
            ))}
          </div>

          <div className="mt-2 flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button
              onClick={() => setStep("preview")}
              disabled={jobErrors.length > 0 || selected.size === 0}
            >
              Continue
            </Button>
          </div>
        </div>
      )}

      {step === "preview" && (
        <div className="flex flex-col gap-4">
          <div className="rounded-[var(--radius-md)] border border-border bg-surface p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Job Preview</p>
            <h3 className="mt-1.5 text-base font-semibold text-foreground">{job.title}</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {job.location || "Location not specified"} · {job.experience_min}–{job.experience_max} years
            </p>
            <p className="mt-3 whitespace-pre-line text-sm text-muted-foreground line-clamp-6">{job.description}</p>
            {job.required_skills.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {job.required_skills.map((s) => (
                  <Badge key={s} tone="accent">
                    {s}
                  </Badge>
                ))}
              </div>
            )}
          </div>

          <p className="text-sm text-muted-foreground">
            Publishing to: <span className="font-medium text-foreground">{Array.from(selected).map((p) => PLATFORM_LABEL[p] ?? p).join(", ")}</span>
          </p>

          <div className="mt-2 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setStep("checklist")}>
              Back
            </Button>
            <Button onClick={handlePublish}>Confirm &amp; Publish</Button>
          </div>
        </div>
      )}

      {step === "publishing" && (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Publishing…
        </div>
      )}

      {step === "results" && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            {results.map((r) => (
              <ResultRow key={r.platform} result={r} onRetry={() => handleRetry(r.platform)} />
            ))}
          </div>
          <div className="mt-2 flex justify-end">
            <Button onClick={onClose}>Done</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function PlatformChecklistRow({
  item,
  checked,
  onToggle,
}: {
  item: PlatformChecklistItem;
  checked: boolean;
  onToggle: () => void;
}) {
  const disabled = !item.available || !item.connected;
  return (
    <label
      className={`flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-border p-3 ${disabled ? "opacity-60" : "cursor-pointer hover:border-[color-mix(in_srgb,var(--accent)_40%,var(--border))]"}`}
    >
      <span className="flex items-center gap-3">
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={onToggle}
          className="h-4 w-4 rounded border-border accent-[var(--accent)]"
        />
        <span>
          <span className="block text-sm font-medium text-foreground">
            {PLATFORM_LABEL[item.platform] ?? item.platform}
            {item.platform === "mock" && (
              <Badge tone="warning" className="ml-2 align-middle">
                MOCK / DEVELOPMENT
              </Badge>
            )}
          </span>
          <span className="block text-xs text-muted-foreground">
            {item.available ? (item.connected ? "Connected" : item.connectionError ?? "Not connected") : "Not available in this environment"}
          </span>
        </span>
      </span>
      {item.existingStatus && <Badge tone="neutral">{item.existingStatus}</Badge>}
    </label>
  );
}

function ResultRow({ result, onRetry }: { result: PublishResult; onRetry: () => void }) {
  const isPublished = result.status === "PUBLISHED";
  return (
    <div className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-border p-3">
      <div className="flex items-center gap-2.5">
        {isPublished ? (
          <CheckCircle2 className="h-4 w-4 text-success" />
        ) : result.error?.toLowerCase().includes("not configured") ? (
          <AlertTriangle className="h-4 w-4 text-warning" />
        ) : (
          <XCircle className="h-4 w-4 text-danger" />
        )}
        <div>
          <p className="text-sm font-medium text-foreground">{PLATFORM_LABEL[result.platform] ?? result.platform}</p>
          <p className="text-xs text-muted-foreground">
            {isPublished ? "Published" : result.error ?? "Publishing failed"}
          </p>
          {isPublished && result.externalUrl && result.platform !== "mock" && (
            <a href={result.externalUrl} target="_blank" rel="noreferrer" className="text-xs text-accent hover:underline">
              View posting
            </a>
          )}
          {isPublished && result.platform === "mock" && (
            <span className="text-xs text-muted-foreground">Simulated posting — no real URL (see Careers page for the real listing).</span>
          )}
        </div>
      </div>
      {!isPublished && (
        <Button size="sm" variant="secondary" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
}
