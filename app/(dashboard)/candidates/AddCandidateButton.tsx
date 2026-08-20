"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Upload, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { extractCandidateFromResumeAction, addCandidateAction } from "@/lib/actions/candidates";

const EMPTY_FIELDS = { name: "", email: "", phone: "", location: "", linkedinUrl: "", portfolioUrl: "" };

export function AddCandidateButton({ jobs }: { jobs: { id: string; title: string }[] }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [jobId, setJobId] = useState(jobs[0]?.id ?? "");
  const [fields, setFields] = useState(EMPTY_FIELDS);
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [extracting, setExtracting] = useState(false);
  const [saving, setSaving] = useState(false);

  function resetAndClose() {
    setOpen(false);
    setFields(EMPTY_FIELDS);
    setResumeFile(null);
  }

  async function handleResumeSelected(file: File) {
    setResumeFile(file);
    setExtracting(true);
    try {
      const formData = new FormData();
      formData.set("resume", file);
      const extracted = await extractCandidateFromResumeAction(formData);
      setFields({
        name: extracted.name || "",
        email: extracted.email || "",
        phone: extracted.phone || "",
        location: extracted.location || "",
        linkedinUrl: extracted.linkedin_url || "",
        portfolioUrl: extracted.portfolio_url || "",
      });
      showToast("Details filled in from the resume — review before saving.", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Couldn't read details from that resume — fill them in manually.", "danger");
    } finally {
      setExtracting(false);
    }
  }

  async function handleSave() {
    if (!jobId || !fields.name.trim() || !fields.email.trim()) return;
    setSaving(true);
    try {
      const formData = new FormData();
      if (resumeFile) formData.set("resume", resumeFile);
      const result = await addCandidateAction(
        {
          jobId,
          name: fields.name,
          email: fields.email,
          phone: fields.phone || null,
          location: fields.location || null,
          linkedinUrl: fields.linkedinUrl || null,
          portfolioUrl: fields.portfolioUrl || null,
        },
        formData
      );
      showToast(result.outcome === "noop" ? "Candidate already applied to this job — no duplicate created." : "Candidate added.", "success");
      resetAndClose();
      router.refresh();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to add candidate.", "danger");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" />
        Add Candidate
      </Button>
      <Modal open={open} onClose={resetAndClose} title="Add candidate">
        {jobs.length === 0 ? (
          <p className="text-sm text-muted-foreground">Create a job first — a candidate needs a role to apply to.</p>
        ) : (
          <div className="flex flex-col gap-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">Job</label>
              <Select value={jobId} onChange={(e) => setJobId(e.target.value)} className="w-full">
                {jobs.map((job) => (
                  <option key={job.id} value={job.id}>
                    {job.title}
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">Resume (optional — auto-fills the fields below)</label>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.docx,.txt,.md"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleResumeSelected(file);
                }}
              />
              <Button variant="secondary" onClick={() => fileInputRef.current?.click()} disabled={extracting} className="w-full justify-start">
                {extracting ? <Sparkles className="h-4 w-4 animate-pulse" /> : <Upload className="h-4 w-4" />}
                {extracting ? "Reading resume…" : resumeFile ? resumeFile.name : "Choose a file…"}
              </Button>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">Full name</label>
                <Input value={fields.name} onChange={(e) => setFields({ ...fields, name: e.target.value })} placeholder="Candidate name" />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">Email</label>
                <Input value={fields.email} onChange={(e) => setFields({ ...fields, email: e.target.value })} placeholder="you@example.com" type="email" />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">Phone</label>
                <Input value={fields.phone} onChange={(e) => setFields({ ...fields, phone: e.target.value })} placeholder="+91 98765 43210" />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">Location</label>
                <Input value={fields.location} onChange={(e) => setFields({ ...fields, location: e.target.value })} placeholder="City" />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">LinkedIn</label>
                <Input value={fields.linkedinUrl} onChange={(e) => setFields({ ...fields, linkedinUrl: e.target.value })} placeholder="https://linkedin.com/in/…" />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">Portfolio</label>
                <Input value={fields.portfolioUrl} onChange={(e) => setFields({ ...fields, portfolioUrl: e.target.value })} placeholder="https://…" />
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={resetAndClose}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={saving || !jobId || !fields.name.trim() || !fields.email.trim()}>
                {saving ? "Adding…" : "Add Candidate"}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
