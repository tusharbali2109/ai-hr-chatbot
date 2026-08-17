"use client";

import { useRef, useState } from "react";
import { Sparkles, ChevronDown, X, Upload, FileText } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import type { StructuredInputOverrides } from "@/lib/ai/provider";

export interface RequirementStepProps {
  onSubmit: (rawRequirement: string, overrides: StructuredInputOverrides) => void;
  submitting: boolean;
  error: string | null;
  initialRawRequirement: string;
}

export function RequirementStep({ onSubmit, submitting, error, initialRawRequirement }: RequirementStepProps) {
  const [raw, setRaw] = useState(initialRawRequirement);
  const [uploadedName, setUploadedName] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showStructured, setShowStructured] = useState(false);

  const [title, setTitle] = useState("");
  const [department, setDepartment] = useState("");
  const [location, setLocation] = useState("");
  const [employmentType, setEmploymentType] = useState("");
  const [experienceMin, setExperienceMin] = useState("");
  const [experienceMax, setExperienceMax] = useState("");
  const [salaryRange, setSalaryRange] = useState("");
  const [workMode, setWorkMode] = useState("");
  const [openings, setOpenings] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit(raw, {
      title: title || undefined,
      department: department || undefined,
      location: location || undefined,
      employment_type: employmentType || undefined,
      experience_min: experienceMin ? Number(experienceMin) : undefined,
      experience_max: experienceMax ? Number(experienceMax) : undefined,
      salary_range: salaryRange || undefined,
      work_mode: workMode || undefined,
      number_of_openings: openings ? Number(openings) : undefined,
    });
  }

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setUploadError(null);
    const extension = file.name.split(".").pop()?.toLowerCase();
    if (!extension || !["txt", "md"].includes(extension)) {
      setUploadError("Upload a .txt or .md JD. For Word/PDF, copy its text and paste it below.");
      return;
    }
    if (file.size > 1_000_000) {
      setUploadError("JD file must be smaller than 1 MB.");
      return;
    }
    const text = await file.text();
    if (!text.trim()) {
      setUploadError("This JD file is empty.");
      return;
    }
    setRaw(text);
    setUploadedName(file.name);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <div className="rounded-[var(--radius-xl)] border border-border bg-surface p-6">
        <div className="mb-4 flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)] bg-accent/10 text-accent">
            <Sparkles className="h-4.5 w-4.5" />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-foreground">Tell us who you&apos;re looking for</h1>
            <p className="text-sm text-muted-foreground">Describe the role in your own words — the AI will structure the rest.</p>
          </div>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-[var(--radius-md)] border border-dashed border-border bg-background p-3">
          <input ref={fileInputRef} type="file" accept=".txt,.md,text/plain,text/markdown" className="hidden" onChange={(e) => handleFile(e.target.files?.[0])} />
          <Button type="button" variant="secondary" size="sm" onClick={() => fileInputRef.current?.click()}>
            <Upload className="h-4 w-4" /> Upload JD
          </Button>
          <div className="min-w-0 text-xs text-muted-foreground">
            {uploadedName ? <span className="flex items-center gap-1.5 text-success"><FileText className="h-3.5 w-3.5" />{uploadedName} loaded</span> : ".txt or .md up to 1 MB · paste text from Word/PDF below"}
          </div>
        </div>
        {uploadError && <p role="alert" className="mb-3 text-sm text-danger">{uploadError}</p>}

        <textarea
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          rows={7}
          placeholder="Describe the role you're hiring for in your own words... e.g. Need a senior Python backend engineer, 4-7 years, strong FastAPI and AWS. AI/LLM experience preferred. Remote preferred."
          className="w-full resize-none rounded-[var(--radius-md)] border border-border bg-background px-4 py-3 text-sm leading-relaxed text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/20"
        />

        <div className="mt-3 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setRaw("")}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Clear
          </button>
          <span className="text-xs text-muted-foreground">{raw.length} characters</span>
        </div>
      </div>

      <div className="rounded-[var(--radius-xl)] border border-border bg-surface">
        <button
          type="button"
          onClick={() => setShowStructured((v) => !v)}
          className="flex w-full items-center justify-between px-6 py-4 text-left"
        >
          <span className="text-sm font-medium text-foreground">Optional details</span>
          <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${showStructured ? "rotate-180" : ""}`} />
        </button>

        {showStructured && (
          <div className="grid grid-cols-1 gap-4 border-t border-border px-6 py-5 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Job Title">
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Senior Backend Engineer" />
            </Field>
            <Field label="Department">
              <Input value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="e.g. Engineering" />
            </Field>
            <Field label="Location">
              <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Bengaluru" />
            </Field>
            <Field label="Employment Type">
              <Select value={employmentType} onChange={(e) => setEmploymentType(e.target.value)}>
                <option value="">Not specified</option>
                <option value="full_time">Full-time</option>
                <option value="part_time">Part-time</option>
                <option value="contract">Contract</option>
                <option value="internship">Internship</option>
              </Select>
            </Field>
            <Field label="Experience (min yrs)">
              <Input type="number" min={0} value={experienceMin} onChange={(e) => setExperienceMin(e.target.value)} />
            </Field>
            <Field label="Experience (max yrs)">
              <Input type="number" min={0} value={experienceMax} onChange={(e) => setExperienceMax(e.target.value)} />
            </Field>
            <Field label="Salary Range">
              <Input value={salaryRange} onChange={(e) => setSalaryRange(e.target.value)} placeholder="e.g. ₹18-28 LPA" />
            </Field>
            <Field label="Work Mode">
              <Select value={workMode} onChange={(e) => setWorkMode(e.target.value)}>
                <option value="">Not specified</option>
                <option value="remote">Remote</option>
                <option value="hybrid">Hybrid</option>
                <option value="onsite">Onsite</option>
              </Select>
            </Field>
            <Field label="Number of Openings">
              <Input type="number" min={1} value={openings} onChange={(e) => setOpenings(e.target.value)} />
            </Field>
          </div>
        )}
      </div>

      {error && (
        <p role="alert" className="flex items-center gap-2 rounded-[var(--radius-sm)] bg-danger/10 px-3 py-2 text-sm text-danger">
          <X className="h-4 w-4 shrink-0" />
          {error}
        </p>
      )}

      <div className="flex justify-end">
        <Button type="submit" size="lg" disabled={submitting || !raw.trim()}>
          {submitting ? "Understanding requirement…" : "Continue"}
        </Button>
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}
