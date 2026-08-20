"use client";

import { useState } from "react";
import { CheckCircle2, Upload } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

export function ApplyForm({ jobId }: { jobId: string }) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [resumeName, setResumeName] = useState<string | null>(null);

  async function handleSubmit(formData: FormData) {
    setSubmitting(true);
    setError(null);
    try {
      formData.set("jobId", jobId);
      const response = await fetch("/api/careers/apply", { method: "POST", body: formData });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Something went wrong. Please try again.");
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="flex flex-col items-center gap-3 py-6 text-center">
        <CheckCircle2 className="h-8 w-8 text-success" />
        <p className="text-sm font-medium text-foreground">Application received</p>
        <p className="text-sm text-muted-foreground">Thanks for applying — we&apos;ll be in touch if there&apos;s a match.</p>
      </div>
    );
  }

  return (
    <form action={handleSubmit} className="flex flex-col gap-4">
      {/* Honeypot — hidden from real applicants, bots tend to fill every field. */}
      <input type="text" name="company_website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-foreground">Full name</label>
          <Input name="name" required placeholder="Your name" />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-foreground">Email</label>
          <Input name="email" type="email" required placeholder="you@example.com" />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-foreground">Phone (optional)</label>
          <Input name="phone" placeholder="+91 98765 43210" />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-foreground">Location (optional)</label>
          <Input name="location" placeholder="City" />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-foreground">LinkedIn (optional)</label>
          <Input name="linkedinUrl" placeholder="https://linkedin.com/in/…" />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-foreground">Portfolio (optional)</label>
          <Input name="portfolioUrl" placeholder="https://…" />
        </div>
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium text-foreground">Resume (PDF or Word)</label>
        <label className="flex h-10 w-full cursor-pointer items-center gap-2 rounded-[var(--radius-md)] border border-border bg-surface-elevated px-3 text-sm text-muted-foreground hover:border-accent">
          <Upload className="h-4 w-4" />
          {resumeName ?? "Choose a file…"}
          <input
            type="file"
            name="resume"
            accept=".pdf,.doc,.docx"
            className="hidden"
            onChange={(e) => setResumeName(e.target.files?.[0]?.name ?? null)}
          />
        </label>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      <Button type="submit" disabled={submitting}>
        {submitting ? "Submitting…" : "Submit Application"}
      </Button>
    </form>
  );
}
