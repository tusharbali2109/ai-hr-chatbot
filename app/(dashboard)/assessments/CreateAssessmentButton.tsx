"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/ui/Toast";
import { generateAssessmentAction } from "@/lib/actions/assessment";

export function CreateAssessmentButton({ jobs }: { jobs: { id: string; title: string; hasAssessment: boolean }[] }) {
  const router = useRouter();
  const { showToast } = useToast();
  const available = jobs.filter((job) => !job.hasAssessment);
  const [open, setOpen] = useState(false);
  const [jobId, setJobId] = useState(available[0]?.id ?? "");
  const [generating, setGenerating] = useState(false);

  async function generate() {
    if (!jobId) return;
    setGenerating(true);
    try {
      const result = await generateAssessmentAction(jobId);
      showToast("Assessment draft generated. Review and approve it before assigning.", "success");
      router.push(`/assessments/${result.assessmentId}/builder`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Failed to generate assessment.", "danger");
    } finally {
      setGenerating(false);
    }
  }

  return <>
    <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" />Create Assessment</Button>
    <Modal open={open} onClose={() => setOpen(false)} title="Create job assessment">
      {available.length === 0 ? <div className="flex flex-col gap-3"><p className="text-sm text-muted-foreground">No approved job without an assessment is available. Create or open a job, complete its JD review, and click Approve first.</p><Link href="/jobs" className="text-sm font-medium text-accent hover:underline">Open Jobs →</Link></div> : <div className="flex flex-col gap-4">
        <div><label className="mb-1.5 block text-sm font-medium text-foreground">Approved job</label><Select value={jobId} onChange={(event) => setJobId(event.target.value)} className="w-full">{available.map((job) => <option key={job.id} value={job.id}>{job.title}</option>)}</Select><p className="mt-2 text-xs text-muted-foreground">Questions are generated from the job&apos;s approved JD and screening criteria.</p></div>
        <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={generate} disabled={generating}><Sparkles className="h-4 w-4" />{generating ? "Generating…" : "Generate draft"}</Button></div>
      </div>}
    </Modal>
  </>;
}
