"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Wand2, X, CheckCircle2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Toast";
import type { JDGeneration } from "@/lib/ai/schemas";
import type { RequirementExtraction } from "@/lib/ai/schemas";
import type { JobFactsInput } from "@/lib/services/jd";
import { regenerateJdAction, improveJdAction, saveJdEditsAction, approveJdAction } from "@/lib/actions/jd";
import { validateJdForApproval } from "@/lib/jd/logic";
import { ChipListEditor } from "./ChipListEditor";
import { CompareModal } from "./CompareModal";

export interface ReviewStepProps {
  jobId: string;
  initialJd: JDGeneration;
  requirement: RequirementExtraction;
}

export function ReviewStep({ jobId, initialJd, requirement }: ReviewStepProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [isPending, startTransition] = useTransition();

  const [jd, setJd] = useState<JDGeneration>(initialJd);
  const [location, setLocation] = useState(requirement.location);
  const [workMode, setWorkMode] = useState(normalizeWorkMode(requirement.work_mode));
  const [employmentType, setEmploymentType] = useState(normalizeEmploymentType(requirement.employment_type));
  const [experienceMin, setExperienceMin] = useState(requirement.experience_min ?? 0);
  const [experienceMax, setExperienceMax] = useState(requirement.experience_max ?? 0);

  const [improveCommand, setImproveCommand] = useState("");
  const [proposedDraft, setProposedDraft] = useState<JDGeneration | null>(null);
  const [compareOpen, setCompareOpen] = useState(false);
  const [busy, setBusy] = useState<"regenerate" | "improve" | "save" | "approve" | null>(null);

  const facts = (): JobFactsInput => ({
    location,
    work_mode: workMode || null,
    employment_type: employmentType,
    experience_min: experienceMin,
    experience_max: experienceMax,
  });

  const validation = validateJdForApproval({
    title: jd.title,
    description: jd.description,
    responsibilities: jd.responsibilities,
    required_skills: jd.required_skills,
    preferred_skills: jd.preferred_skills,
    companyId: "present", // presence checked server-side; this UI gate covers content completeness
  });

  async function handleRegenerate() {
    setBusy("regenerate");
    try {
      const draft = await regenerateJdAction({
        ...requirement,
        location,
        work_mode: workMode || "Not specified",
        employment_type: employmentType,
        experience_min: experienceMin,
        experience_max: experienceMax,
      });
      setProposedDraft(draft);
      setCompareOpen(true);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Regeneration failed", "danger");
    } finally {
      setBusy(null);
    }
  }

  async function handleImprove() {
    if (!improveCommand.trim()) return;
    setBusy("improve");
    try {
      const draft = await improveJdAction(jd, improveCommand);
      setProposedDraft(draft);
      setCompareOpen(true);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "AI improvement failed", "danger");
    } finally {
      setBusy(null);
    }
  }

  function applyProposedDraft() {
    if (proposedDraft) setJd(proposedDraft);
    setCompareOpen(false);
    setProposedDraft(null);
    setImproveCommand("");
    showToast("AI version applied — remember to save", "info");
  }

  function handleSave() {
    setBusy("save");
    startTransition(async () => {
      try {
        await saveJdEditsAction(jobId, jd, facts());
        showToast("Changes saved as a new version", "success");
      } catch (err) {
        showToast(err instanceof Error ? err.message : "Failed to save changes", "danger");
      } finally {
        setBusy(null);
      }
    });
  }

  function handleApprove() {
    if (!validation.valid) {
      showToast(validation.errors[0], "danger");
      return;
    }
    setBusy("approve");
    startTransition(async () => {
      try {
        await approveJdAction(jobId, jd, facts());
        showToast("Job description approved", "success");
        router.push(`/jobs/${jobId}`);
      } catch (err) {
        showToast(err instanceof Error ? err.message : "Failed to approve", "danger");
      } finally {
        setBusy(null);
      }
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left: generated JD, editable */}
        <div className="flex flex-col gap-4 lg:col-span-2">
          <Section title="Job Title">
            <Input value={jd.title} onChange={(e) => setJd({ ...jd, title: e.target.value })} />
          </Section>

          <Section title="Role Description">
            <textarea
              value={jd.description}
              onChange={(e) => setJd({ ...jd, description: e.target.value })}
              rows={8}
              className="w-full resize-none rounded-[var(--radius-md)] border border-border bg-background px-3 py-2.5 text-sm leading-relaxed text-foreground focus-visible:outline-none focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/20"
            />
          </Section>

          <Section title="Responsibilities">
            <ListEditor items={jd.responsibilities} onChange={(responsibilities) => setJd({ ...jd, responsibilities })} />
          </Section>

          <Section title="Required Skills">
            <ChipListEditor items={jd.required_skills} onChange={(required_skills) => setJd({ ...jd, required_skills })} tone="accent" />
          </Section>

          <Section title="Preferred Skills">
            <ChipListEditor items={jd.preferred_skills} onChange={(preferred_skills) => setJd({ ...jd, preferred_skills })} tone="info" />
          </Section>

          <Section title="Education">
            <Input value={jd.education} onChange={(e) => setJd({ ...jd, education: e.target.value })} />
          </Section>

          <div className="rounded-[var(--radius-lg)] border border-border bg-surface p-4">
            <p className="mb-2 flex items-center gap-1.5 text-sm font-medium text-foreground">
              <Wand2 className="h-4 w-4 text-accent" />
              Ask AI to improve this JD
            </p>
            <div className="flex gap-2">
              <Input
                value={improveCommand}
                onChange={(e) => setImproveCommand(e.target.value)}
                placeholder="e.g. Make this JD more concise / Make it more senior / Remove unnecessary requirements"
              />
              <Button variant="secondary" onClick={handleImprove} disabled={busy === "improve" || !improveCommand.trim()}>
                {busy === "improve" ? "Thinking…" : "Improve"}
              </Button>
            </div>
          </div>
        </div>

        {/* Right: AI understanding + facts */}
        <div className="flex flex-col gap-4">
          <div className="rounded-[var(--radius-lg)] border border-border bg-surface p-5">
            <h3 className="mb-4 text-sm font-semibold text-foreground">Role Details</h3>
            <div className="flex flex-col gap-3">
              <FactField label="Location">
                <Input value={location} onChange={(e) => setLocation(e.target.value)} />
              </FactField>
              <FactField label="Work Mode">
                <Select value={workMode} onChange={(e) => setWorkMode(e.target.value as typeof workMode)}>
                  <option value="">Not specified</option>
                  <option value="remote">Remote</option>
                  <option value="hybrid">Hybrid</option>
                  <option value="onsite">Onsite</option>
                </Select>
              </FactField>
              <FactField label="Employment Type">
                <Select value={employmentType} onChange={(e) => setEmploymentType(e.target.value as typeof employmentType)}>
                  <option value="full_time">Full-time</option>
                  <option value="part_time">Part-time</option>
                  <option value="contract">Contract</option>
                  <option value="internship">Internship</option>
                </Select>
              </FactField>
              <div className="grid grid-cols-2 gap-2">
                <FactField label="Min yrs">
                  <Input type="number" min={0} value={experienceMin} onChange={(e) => setExperienceMin(Number(e.target.value))} />
                </FactField>
                <FactField label="Max yrs">
                  <Input type="number" min={0} value={experienceMax} onChange={(e) => setExperienceMax(Number(e.target.value))} />
                </FactField>
              </div>
            </div>
          </div>

          <div className="rounded-[var(--radius-lg)] border border-border bg-surface p-5">
            <h3 className="mb-3 text-sm font-semibold text-foreground">Screening Criteria</h3>
            <p className="mb-2 text-xs font-medium text-muted-foreground">Mandatory</p>
            <div className="mb-3 flex flex-wrap gap-1.5">
              {jd.screening_criteria.mandatory.map((s) => (
                <Badge key={s.skill} tone="accent">
                  {s.skill} · {s.importance}
                </Badge>
              ))}
            </div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">Preferred</p>
            <div className="flex flex-wrap gap-1.5">
              {jd.screening_criteria.preferred.map((s) => (
                <Badge key={s.skill} tone="info">
                  {s.skill} · {s.importance}
                </Badge>
              ))}
            </div>
          </div>

          <Button variant="secondary" onClick={handleRegenerate} disabled={busy === "regenerate"}>
            <RefreshCw className="h-4 w-4" />
            {busy === "regenerate" ? "Regenerating…" : "Regenerate with AI"}
          </Button>

          {!validation.valid && (
            <div className="rounded-[var(--radius-md)] border border-danger/30 bg-danger/10 p-3 text-xs text-danger">
              <p className="mb-1 flex items-center gap-1.5 font-medium">
                <AlertTriangle className="h-3.5 w-3.5" />
                Before you can approve
              </p>
              <ul className="list-disc pl-4">
                {validation.errors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </div>
          )}
          {validation.valid && (
            <div className="flex items-center gap-1.5 text-xs text-success">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Ready to approve
            </div>
          )}
        </div>
      </div>

      <div className="flex justify-end gap-2 border-t border-border pt-5">
        <Button variant="secondary" onClick={handleSave} disabled={isPending && busy === "save"}>
          {busy === "save" ? "Saving…" : "Save Changes"}
        </Button>
        <Button onClick={handleApprove} disabled={!validation.valid || (isPending && busy === "approve")}>
          {busy === "approve" ? "Approving…" : "Approve JD"}
        </Button>
      </div>

      <CompareModal
        open={compareOpen}
        current={jd}
        proposed={proposedDraft}
        onClose={() => setCompareOpen(false)}
        onApply={applyProposedDraft}
      />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-border bg-surface p-4">
      <p className="mb-2 text-sm font-medium text-foreground">{title}</p>
      {children}
    </div>
  );
}

function FactField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function ListEditor({ items, onChange }: { items: string[]; onChange: (items: string[]) => void }) {
  return (
    <div className="flex flex-col gap-2">
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input
            value={item}
            onChange={(e) => {
              const next = [...items];
              next[i] = e.target.value;
              onChange(next);
            }}
          />
          <button
            type="button"
            onClick={() => onChange(items.filter((_, idx) => idx !== i))}
            aria-label="Remove"
            className="rounded-md p-1.5 text-muted-foreground hover:bg-surface-elevated hover:text-danger"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...items, ""])}
        className="self-start text-xs font-medium text-accent hover:underline"
      >
        + Add responsibility
      </button>
    </div>
  );
}

function normalizeWorkMode(value: string): "" | "remote" | "hybrid" | "onsite" {
  const v = value.toLowerCase();
  return v === "remote" || v === "hybrid" || v === "onsite" ? v : "";
}

function normalizeEmploymentType(value: string): "full_time" | "part_time" | "contract" | "internship" {
  const v = value.toLowerCase().replace(/[\s-]/g, "_");
  return v === "full_time" || v === "part_time" || v === "contract" || v === "internship" ? v : "full_time";
}
