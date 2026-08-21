import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { extractTextFromFile } from "@/lib/files/text-extraction";

/** Best-effort resume text extraction, shared by screening and interview
 * question generation so both are grounded in the candidate's actual
 * resume content instead of only the link/structured-field fallback.
 * Downloads directly from the private "public-resumes" storage bucket
 * (candidate.resume_url is a bare {job_id}/filename storage path for
 * uploads — see lib/services/candidates.ts::getResumeSignedUrl; an
 * external job-board URL has no file to download here). Never throws —
 * any failure (missing file, unsupported type, empty resume) falls back
 * to undefined so callers use their existing no-resume-text behavior
 * rather than failing the whole caller. Accepts an optional client for
 * system/service-role callers that have no recruiter session. */
export async function fetchCandidateResumeText(resumeUrl: string | null, client?: SupabaseClient): Promise<string | undefined> {
  if (!resumeUrl || /^https?:\/\//i.test(resumeUrl)) return undefined;

  try {
    const supabase = client ?? ((await createServerClient()) as unknown as SupabaseClient);
    const { data, error } = await supabase.storage.from("public-resumes").download(resumeUrl);
    if (error || !data) throw error ?? new Error("No resume file returned from storage.");

    const buffer = Buffer.from(await data.arrayBuffer());
    const filename = resumeUrl.split("/").pop() ?? resumeUrl;
    const ext = filename.toLowerCase().split(".").pop() ?? "";
    const mimeType =
      ext === "pdf"
        ? "application/pdf"
        : ext === "docx"
          ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          : ext === "txt" || ext === "md"
            ? "text/plain"
            : "application/octet-stream";

    const text = await extractTextFromFile(buffer, filename, mimeType);
    return text || undefined;
  } catch (err) {
    console.warn(`Resume text extraction failed for "${resumeUrl}".`, err);
    return undefined;
  }
}
