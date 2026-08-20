import type { SupabaseClient } from "@supabase/supabase-js";
import { getJob } from "@/lib/services/jobs";
import { getApplication } from "@/lib/services/applications";
import { getAssignment, getAssessment, saveOpenEndedReview } from "@/lib/services/assessments";
import { getAIProvider } from "@/lib/ai";

export interface GenerateOpenEndedReviewResult {
  status: "COMPLETED" | "FAILED";
  assignmentId: string;
  error?: string;
}

/**
 * Produces the qualitative interviewer briefing for one open-ended
 * assignment's manually-uploaded submission. Deliberately does NOT touch
 * application stage, score, or recommendation — unlike evaluateAssessmentSubmission
 * (structured assessments), this is advisory content for the human
 * interviewer, not an AI gating decision, per the spec described for this
 * flow. Safe to re-run (overwrites the prior review + timestamp).
 */
export async function generateOpenEndedReview(assignmentId: string, client: SupabaseClient): Promise<GenerateOpenEndedReviewResult> {
  const assignment = await getAssignment(assignmentId, client);
  if (!assignment) throw new Error("Assignment not found.");
  if (!assignment.submission_text) throw new Error("No submission has been uploaded for this assignment yet.");

  const [application, assessment] = await Promise.all([
    getApplication(assignment.application_id, client),
    getAssessment(assignment.assessment_id, client),
  ]);
  if (!application) throw new Error("Application not found.");
  if (!assessment) throw new Error("Assessment not found.");
  if (!assessment.brief_text) throw new Error("This assessment has no task brief to compare the submission against.");

  const job = await getJob(application.job_id, client);
  if (!job) throw new Error("Job not found.");

  try {
    const review = await getAIProvider().reviewOpenEndedSubmission({
      jobTitle: job.title,
      jobDescription: job.description,
      briefText: assessment.brief_text,
      submissionText: assignment.submission_text,
    });

    await saveOpenEndedReview(assignmentId, review, client);
    return { status: "COMPLETED", assignmentId };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Review generation failed for an unknown reason.";
    return { status: "FAILED", assignmentId, error: message };
  }
}
