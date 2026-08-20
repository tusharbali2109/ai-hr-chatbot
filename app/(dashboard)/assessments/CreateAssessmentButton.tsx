"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, Sparkles, Upload } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { generateAssessmentAction, createOpenEndedAssessmentAction } from "@/lib/actions/assessment";

type Mode = "AI_GENERATED" | "UPLOAD_BRIEF";

export function CreateAssessmentButton({ jobs }: { jobs: { id: string; title: string; hasAssessment: boolean }[] }) {
  const router = useRouter();
  const { showToast } = useToast();
  const available = jobs.filter((job) => !job.hasAssessment);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("AI_GENERATED");
  const [jobId, setJobId] = useState(available[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [generating, setGenerating] = useState(false);

  async function generate() {
    if (!jobId) return;
    setGenerating(true);
    try {
      const result = await generateAssessmentAction(jobId);
      showToast("Assessment draft generated. Review and approve it before assigning.", "success");
      setOpen(false);
      router.push(`/assessments/${result.assessmentId}/builder`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Failed to generate assessment.", "danger");
    } finally {
      setGenerating(false);
    }
  }

  async function uploadBrief() {
    if (!jobId || !title.trim() || !file) return;
    setGenerating(true);
    try {
      const formData = new FormData();
      formData.set("file", file);
      await createOpenEndedAssessmentAction(jobId, title, formData);
      showToast("Task brief uploaded. This assessment is ready to assign.", "success");
      setOpen(false);
      router.push("/assessments");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Failed to upload the brief.", "danger");
    } finally {
      setGenerating(false);
    }
  }

  function resetAndClose() {
    setOpen(false);
    setMode("AI_GENERATED");
    setTitle("");
    setFile(null);
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" />
        Create Assessment
      </Button>
      <Modal open={open} onClose={resetAndClose} title="Create job assessment">
        {available.length === 0 ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              No approved job without an assessment is available. Create or open a job, complete its JD review, and click Approve first.
            </p>
            <Link href="/jobs" className="text-sm font-medium text-accent hover:underline">
              Open Jobs →
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex gap-2 rounded-[var(--radius-md)] border border-border bg-surface-elevated p-1">
              <button
                type="button"
                onClick={() => setMode("AI_GENERATED")}
                className={`flex-1 rounded-[var(--radius-sm)] px-3 py-1.5 text-sm font-medium transition-colors ${
                  mode === "AI_GENERATED" ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                AI-generated questions
              </button>
              <button
                type="button"
                onClick={() => setMode("UPLOAD_BRIEF")}
                className={`flex-1 rounded-[var(--radius-sm)] px-3 py-1.5 text-sm font-medium transition-colors ${
                  mode === "UPLOAD_BRIEF" ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Upload a task brief
              </button>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">Approved job</label>
              <Select value={jobId} onChange={(event) => setJobId(event.target.value)} className="w-full">
                {available.map((job) => (
                  <option key={job.id} value={job.id}>
                    {job.title}
                  </option>
                ))}
              </Select>
            </div>

            {mode === "AI_GENERATED" ? (
              <>
                <p className="text-xs text-muted-foreground">Questions are generated from the job&apos;s approved JD and screening criteria.</p>
                <div className="flex justify-end gap-2">
                  <Button variant="secondary" onClick={resetAndClose}>
                    Cancel
                  </Button>
                  <Button onClick={generate} disabled={generating}>
                    <Sparkles className="h-4 w-4" />
                    {generating ? "Generating…" : "Generate draft"}
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-foreground">Assessment title</label>
                  <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Take-home system design task" />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-foreground">Task brief (PDF, DOCX, or text)</label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.docx,.txt,.md"
                    className="hidden"
                    onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  />
                  <Button variant="secondary" onClick={() => fileInputRef.current?.click()} className="w-full justify-start">
                    <Upload className="h-4 w-4" />
                    {file ? file.name : "Choose a file…"}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  The candidate completes this outside the platform. Once you assign it, they get emailed the brief — you&apos;ll upload
                  their finished work manually and the AI will produce a review for the interviewer.
                </p>
                <div className="flex justify-end gap-2">
                  <Button variant="secondary" onClick={resetAndClose}>
                    Cancel
                  </Button>
                  <Button onClick={uploadBrief} disabled={generating || !title.trim() || !file}>
                    <Upload className="h-4 w-4" />
                    {generating ? "Uploading…" : "Upload brief"}
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}
