import { NextResponse } from "next/server";
import { createWebhookClient } from "@/lib/supabase/webhook-client";
import { ingestApplicant } from "@/lib/services/ingestion";

const MAX_RESUME_BYTES = 10 * 1024 * 1024;
const ALLOWED_RESUME_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
]);

/**
 * The public "Apply" endpoint — the missing candidate entry point. Before
 * this, an application row could only be created by a job-board webhook or
 * a recruiter's manual sync, and with job boards mock-only there was no way
 * for a real candidate to apply. Deliberately unauthenticated (no
 * candidate/recruiter session exists yet), so it uses the service-role
 * client like the job-board webhook route, and reuses the exact same
 * ingestApplicant() pipeline — same candidate dedup, stage history, and
 * internal event, just a different source_platform.
 */
export async function POST(request: Request) {
  const formData = await request.formData();

  // Honeypot — real applicants never fill a field they can't see.
  if (typeof formData.get("company_website") === "string" && formData.get("company_website") !== "") {
    return NextResponse.json({ ok: true });
  }

  const jobId = formData.get("jobId");
  const name = formData.get("name");
  const email = formData.get("email");
  const phone = formData.get("phone");
  const location = formData.get("location");
  const linkedinUrl = formData.get("linkedinUrl");
  const portfolioUrl = formData.get("portfolioUrl");
  const resume = formData.get("resume");

  if (typeof jobId !== "string" || !jobId) {
    return NextResponse.json({ error: "Missing job." }, { status: 400 });
  }
  if (typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ error: "Name is required." }, { status: 400 });
  }
  if (typeof email !== "string" || !email.trim() || !email.includes("@")) {
    return NextResponse.json({ error: "A valid email is required." }, { status: 400 });
  }

  const supabase = createWebhookClient();

  const { data: job, error: jobError } = await supabase
    .from("jobs")
    .select("id, status, jd_status")
    .eq("id", jobId)
    .maybeSingle();
  if (jobError) return NextResponse.json({ error: "Failed to look up this job." }, { status: 500 });
  if (!job || job.status !== "open" || job.jd_status !== "APPROVED") {
    return NextResponse.json({ error: "This role is no longer accepting applications." }, { status: 404 });
  }

  let resumePath: string | null = null;
  if (resume instanceof File && resume.size > 0) {
    if (resume.size > MAX_RESUME_BYTES) {
      return NextResponse.json({ error: "Resume exceeds the 10MB limit." }, { status: 413 });
    }
    if (!ALLOWED_RESUME_TYPES.has(resume.type)) {
      return NextResponse.json({ error: "Resume must be a PDF or Word document." }, { status: 415 });
    }

    const safeName = resume.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    resumePath = `${jobId}/${Date.now()}_${safeName}`;
    const { error: uploadError } = await supabase.storage
      .from("public-resumes")
      .upload(resumePath, Buffer.from(await resume.arrayBuffer()), { contentType: resume.type, upsert: true });
    if (uploadError) return NextResponse.json({ error: "Failed to upload resume." }, { status: 500 });
  }

  try {
    const result = await ingestApplicant(
      {
        name: name.trim(),
        email: email.trim(),
        phone: typeof phone === "string" ? phone : null,
        location: typeof location === "string" ? location : null,
        resume_url: resumePath,
        linkedin_url: typeof linkedinUrl === "string" && linkedinUrl ? linkedinUrl : null,
        portfolio_url: typeof portfolioUrl === "string" && portfolioUrl ? portfolioUrl : null,
      },
      "careers_site",
      jobId,
      supabase
    );

    if (result.outcome === "skipped_no_email") {
      return NextResponse.json({ error: "A valid email is required." }, { status: 400 });
    }

    return NextResponse.json({ ok: true, alreadyApplied: result.outcome === "noop" });
  } catch {
    return NextResponse.json({ error: "Something went wrong submitting your application. Please try again." }, { status: 500 });
  }
}
