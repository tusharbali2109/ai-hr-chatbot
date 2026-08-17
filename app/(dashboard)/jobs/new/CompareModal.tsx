"use client";

import { AlertTriangle } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import type { JDGeneration } from "@/lib/ai/schemas";
import { diffCriticalFields } from "@/lib/jd/logic";

export function CompareModal({
  open,
  current,
  proposed,
  onClose,
  onApply,
}: {
  open: boolean;
  current: JDGeneration;
  proposed: JDGeneration | null;
  onClose: () => void;
  onApply: () => void;
}) {
  if (!proposed) return null;
  const diff = diffCriticalFields(current, proposed);

  return (
    <Modal open={open} onClose={onClose} title="Compare AI Version" className="max-w-3xl">
      {diff.hasCriticalChanges && (
        <div className="mb-4 flex items-start gap-2 rounded-[var(--radius-md)] border border-warning/30 bg-warning/10 px-3 py-2.5 text-sm text-warning">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-medium">This version changes critical requirements</p>
            <ul className="mt-1 list-disc pl-4 text-xs">
              {diff.experienceChanged && (
                <li>
                  Experience: {current.screening_criteria.experience.min_years ?? "?"}–
                  {current.screening_criteria.experience.max_years ?? "?"} yrs →{" "}
                  {proposed.screening_criteria.experience.min_years ?? "?"}–
                  {proposed.screening_criteria.experience.max_years ?? "?"} yrs
                </li>
              )}
              {diff.mandatorySkillsAdded.length > 0 && <li>Added mandatory: {diff.mandatorySkillsAdded.join(", ")}</li>}
              {diff.mandatorySkillsRemoved.length > 0 && <li>Removed mandatory: {diff.mandatorySkillsRemoved.join(", ")}</li>}
            </ul>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <VersionPanel label="Current Version" jd={current} />
        <VersionPanel label="AI Version" jd={proposed} accent />
      </div>

      <div className="mt-6 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Keep current
        </Button>
        <Button onClick={onApply}>Apply AI version</Button>
      </div>
    </Modal>
  );
}

function VersionPanel({ label, jd, accent }: { label: string; jd: JDGeneration; accent?: boolean }) {
  return (
    <div className={`rounded-[var(--radius-md)] border p-3 ${accent ? "border-accent/40 bg-accent/5" : "border-border bg-surface"}`}>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mb-2 text-sm font-medium text-foreground">{jd.title}</p>
      <p className="mb-3 line-clamp-4 text-xs text-muted-foreground">{jd.description}</p>
      <div className="flex flex-wrap gap-1">
        {jd.screening_criteria.mandatory.map((s) => (
          <Badge key={s.skill} tone="accent" className="text-[10px]">
            {s.skill}
          </Badge>
        ))}
      </div>
    </div>
  );
}
