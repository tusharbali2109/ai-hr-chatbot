import type { Job, JobPostingStatus } from "@/lib/types/database";

/** Gate before a job can be published to any platform — platform-independent. */
export function validateJobForPublish(job: Pick<Job, "jd_status" | "title" | "description">): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (job.jd_status !== "APPROVED") {
    errors.push("The job description must be approved before publishing.");
  }
  if (!job.title || !job.title.trim()) {
    errors.push("Job title is required.");
  }
  if (!job.description || !job.description.trim()) {
    errors.push("Job description is required.");
  }

  return { valid: errors.length === 0, errors };
}

const RETRYABLE_STATUSES: JobPostingStatus[] = ["FAILED"];

/** Only a FAILED posting is retryable — anything else is either already in
 * progress, already published, or intentionally closed/paused. */
export function isRetryable(status: JobPostingStatus): boolean {
  return RETRYABLE_STATUSES.includes(status);
}
