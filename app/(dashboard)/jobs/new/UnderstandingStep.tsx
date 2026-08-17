"use client";

import { CheckCircle2, AlertTriangle, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import type { RequirementExtraction } from "@/lib/ai/schemas";
import { buildUnderstandingFields } from "@/lib/jd/logic";

export interface UnderstandingStepProps {
  requirement: RequirementExtraction;
  onConfirm: () => void;
  onBack: () => void;
  onPickClarification: (option: string) => void;
  generating: boolean;
}

export function UnderstandingStep({ requirement, onConfirm, onBack, onPickClarification, generating }: UnderstandingStepProps) {
  const fields = buildUnderstandingFields(requirement);

  if (requirement.clarification_needed) {
    return (
      <div className="rounded-[var(--radius-xl)] border border-warning/30 bg-warning/5 p-6">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
          <div>
            <h2 className="text-base font-semibold text-foreground">We need a little more information</h2>
            <p className="mt-1 text-sm text-muted-foreground">{requirement.clarification_question}</p>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {requirement.clarification_options.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => onPickClarification(option)}
              className="rounded-full border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground transition-colors duration-[var(--duration-fast)] hover:border-accent hover:text-accent"
            >
              {option}
            </button>
          ))}
        </div>

        <button onClick={onBack} className="mt-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" />
          Rewrite the requirement instead
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-[var(--radius-xl)] border border-border bg-surface p-6">
        <h2 className="mb-1 text-base font-semibold text-foreground">Requirement Understanding</h2>
        <p className="mb-5 text-sm text-muted-foreground">
          Here&apos;s what the AI understood. Go back and adjust your description if anything looks off.
        </p>

        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {fields.map((field) => (
            <div key={field.label} className="flex flex-col gap-1">
              <dt className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                {field.clear ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                ) : (
                  <AlertTriangle className="h-3.5 w-3.5 text-warning" />
                )}
                {field.label}
              </dt>
              <dd className="text-sm text-foreground">{field.value}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-5 flex flex-wrap gap-1.5">
          {requirement.mandatory_skills.map((s) => (
            <Badge key={s} tone="accent">
              {s}
            </Badge>
          ))}
          {requirement.preferred_skills.map((s) => (
            <Badge key={s} tone="info">
              {s}
            </Badge>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <button onClick={onBack} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" />
          Back
        </button>
        <Button size="lg" onClick={onConfirm} disabled={generating}>
          {generating ? "Drafting job description…" : "Generate Job Description"}
        </Button>
      </div>
    </div>
  );
}
