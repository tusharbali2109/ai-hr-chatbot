"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAuthedCompanyId, assertJobOwnership } from "@/lib/services/jd";
import { ingestApplicant, type IngestResult } from "@/lib/services/ingestion";
import { getAIProvider } from "@/lib/ai";
import type { ResumeCandidateExtraction } from "@/lib/ai/schemas";

const MAX_RESUME_BYTES = 10 * 1024 * 1024;

/**
 * Reads an uploaded resume and asks the AI to pull out contact fields —
 * a preview only, nothing is saved. The recruiter reviews/edits the result
 * before addCandidateAction actually creates the candidate. Dynamic import,
 * not static — lib/files/text-extraction.ts pulls in pdf-parse, which
 * breaks Next's action-browser client-reference bundling if statically
 * imported from a "use server" file (see lib/actions/assessment.ts).
 */
export async function extractCandidateFromResumeAction(formData: FormData): Promise<ResumeCandidateExtraction> {
  const file = formData.get("resume");
  if (!(file instanceof File)) throw new Error("A resume file is required.");
  if (file.size > MAX_RESUME_BYTES) throw new Error("File exceeds the 10MB limit.");

  const { extractTextFromFile } = await import("@/lib/files/text-extraction");
  const buffer = Buffer.from(await file.arrayBuffer());
  const text = await extractTextFromFile(buffer, file.name, file.type);
  if (!text) throw new Error("Couldn't read any text from this resume — try a different format (PDF, DOCX, or plain text).");

  return getAIProvider().extractCandidateFromResume(text);
}

export interface AddCandidateInput {
  jobId: string;
  name: string;
  email: string;
  phone: string | null;
  location: string | null;
  linkedinUrl: string | null;
  portfolioUrl: string | null;
}

function safeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

/** Manually adds a candidate + application to a job, reusing the exact same
 * ingestApplicant() pipeline every other source (careers site, job-board
 * webhooks) goes through — same dedup-by-email matching, same stage
 * history, same internal event. Only the source differs. */
export async function addCandidateAction(input: AddCandidateInput, formData: FormData): Promise<IngestResult> {
  if (!input.name.trim()) throw new Error("Candidate name is required.");
  if (!input.email.trim() || !input.email.includes("@")) throw new Error("A valid email is required.");

  const { companyId } = await getAuthedCompanyId();
  await assertJobOwnership(input.jobId, companyId);

  const supabase = await createClient();

  let resumePath: string | null = null;
  const file = formData.get("resume");
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_RESUME_BYTES) throw new Error("Resume exceeds the 10MB limit.");
    resumePath = `${input.jobId}/manual_${Date.now()}_${safeFileName(file.name)}`;
    const { error: uploadError } = await supabase.storage
      .from("public-resumes")
      .upload(resumePath, Buffer.from(await file.arrayBuffer()), { contentType: file.type, upsert: true });
    if (uploadError) throw uploadError;
  }

  const result = await ingestApplicant(
    {
      name: input.name.trim(),
      email: input.email.trim(),
      phone: input.phone,
      location: input.location,
      resume_url: resumePath,
      linkedin_url: input.linkedinUrl,
      portfolio_url: input.portfolioUrl,
    },
    "manual",
    input.jobId,
    supabase
  );

  revalidatePath("/candidates");
  revalidatePath(`/jobs/${input.jobId}`);
  return result;
}
