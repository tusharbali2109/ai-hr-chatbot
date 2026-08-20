"use client";

import { useState } from "react";
import { ExternalLink, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { checkCapabilities } from "@/lib/jobboards/registry";
import type { JobPosting } from "@/lib/types/database";
import { syncApplicationsAction } from "@/lib/actions/jobboards";

const PLATFORM_LABEL: Record<string, string> = {
  mock: "Mock Job Board",
  linkedin: "LinkedIn",
  naukri: "Naukri",
  indeed: "Indeed",
};

const STATUS_TONE: Record<JobPosting["status"], "neutral" | "info" | "success" | "warning" | "danger"> = {
  DRAFT: "neutral",
  QUEUED: "info",
  PUBLISHING: "warning",
  PUBLISHED: "success",
  PAUSED: "warning",
  CLOSED: "neutral",
  FAILED: "danger",
};

function relativeTime(iso: string | null) {
  if (!iso) return "Never";
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function PostingsPanel({ jobId, postings, onSynced }: { jobId: string; postings: JobPosting[]; onSynced: () => void }) {
  const { showToast } = useToast();
  const [syncing, setSyncing] = useState<string | null>(null);

  if (postings.length === 0) return null;

  async function handleSync(posting: JobPosting) {
    setSyncing(posting.id);
    try {
      const result = await syncApplicationsAction(jobId, posting.id);
      showToast(
        `Sync complete: ${result.imported} applicant(s) processed, ${result.newApplications} new, ${result.failed} failed.`,
        result.failed > 0 ? "danger" : "success"
      );
      onSynced();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Sync failed.", "danger");
    } finally {
      setSyncing(null);
    }
  }

  return (
    <div className="col-span-full rounded-[var(--radius-lg)] border border-border bg-surface p-5">
      <h3 className="mb-3 text-sm font-semibold text-foreground">Job Board Postings</h3>
      <div className="flex flex-col gap-3">
        {postings.map((posting) => {
          const capabilities = checkCapabilities(posting.platform);
          const canSync = capabilities?.canFetchApplications ?? false;
          return (
            <div
              key={posting.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-md)] border border-border-subtle p-3"
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground">{PLATFORM_LABEL[posting.platform] ?? posting.platform}</span>
                  <Badge tone={STATUS_TONE[posting.status]}>{posting.status}</Badge>
                  {posting.platform === "mock" && <Badge tone="warning">MOCK</Badge>}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                  {posting.external_url && posting.platform !== "mock" && (
                    <a href={posting.external_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-accent hover:underline">
                      View posting <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                  {posting.external_url && posting.platform === "mock" && (
                    <span>Simulated posting — no real URL</span>
                  )}
                  <span>Last synced: {relativeTime(posting.last_synced_at)}</span>
                  {posting.last_error && <span className="text-danger">{posting.last_error}</span>}
                </div>
              </div>
              {canSync && posting.status === "PUBLISHED" && (
                <Button size="sm" variant="secondary" onClick={() => handleSync(posting)} disabled={syncing === posting.id}>
                  <RefreshCw className={`h-3.5 w-3.5 ${syncing === posting.id ? "animate-spin" : ""}`} />
                  {syncing === posting.id ? "Syncing…" : "Sync Now"}
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
