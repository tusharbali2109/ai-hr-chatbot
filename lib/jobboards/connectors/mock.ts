import type {
  ApplicationsPage,
  ConnectionCheckResult,
  ExternalJobStatus,
  JobBoardCapabilities,
  JobBoardConnector,
  JobPostingInput,
} from "@/lib/jobboards/connector";
import type { RawApplicantPayload } from "@/lib/ingestion/logic";
import { paginateMockApplicants } from "@/lib/jobboards/mock-data";

export class RateLimitError extends Error {
  readonly retryAfterAttempt: number;
  constructor(retryAfterAttempt: number) {
    super("[MOCK] rate limit exceeded — retry with backoff.");
    this.name = "RateLimitError";
    this.retryAfterAttempt = retryAfterAttempt;
  }
}

const MOCK_WEBHOOK_SECRET = "mock-dev-shared-secret";

/**
 * DEVELOPMENT / MOCK connector — simulates a job board's API surface for
 * local development and testing. No network calls are made. Every
 * user-facing string is prefixed [MOCK] or points at a mock-jobboard.local
 * host so it can never be mistaken for a real production integration.
 *
 * To add a real connector (e.g. LinkedIn): implement JobBoardConnector in a
 * new file under lib/jobboards/connectors/, then register it in
 * lib/jobboards/registry.ts. Nothing else in the app needs to change.
 */
class MockJobBoardConnector implements JobBoardConnector {
  readonly platform = "mock";

  readonly capabilities: JobBoardCapabilities = {
    canCreateJob: true,
    canUpdateJob: true,
    canCloseJob: true,
    canFetchApplications: true,
    canReceiveWebhooks: true,
  };

  // First page-1 fetch per external job simulates a rate limit so the
  // caller's backoff/retry path gets exercised against something real.
  private rateLimitedOnce = new Set<string>();

  async checkConnection(): Promise<ConnectionCheckResult> {
    return { connected: true };
  }

  async createJob(job: JobPostingInput): Promise<{ externalJobId: string; externalUrl: string | null }> {
    const externalJobId = `mock-job-${Math.random().toString(36).slice(2, 10)}`;
    return {
      externalJobId,
      externalUrl: `https://mock-jobboard.local/jobs/${externalJobId}?title=${encodeURIComponent(job.title)}`,
    };
  }

  async updateJob(): Promise<void> {
    // No-op: the mock board always "accepts" updates instantly.
  }

  async closeJob(): Promise<void> {
    // No-op: the mock board always "accepts" closures instantly.
  }

  async getJob(externalJobId: string): Promise<ExternalJobStatus> {
    return {
      externalJobId,
      status: "PUBLISHED",
      externalUrl: `https://mock-jobboard.local/jobs/${externalJobId}`,
    };
  }

  async getApplications(externalJobId: string, cursor?: string | null): Promise<ApplicationsPage> {
    if (!cursor && !this.rateLimitedOnce.has(externalJobId)) {
      this.rateLimitedOnce.add(externalJobId);
      throw new RateLimitError(1);
    }
    const page = paginateMockApplicants(cursor);
    return { applications: page.applications, nextCursor: page.nextCursor };
  }

  async getApplication(externalApplicationId: string): Promise<RawApplicantPayload> {
    return { external_application_id: externalApplicationId, name: "[MOCK] Applicant", email: "mock@example.com" };
  }

  async getCandidate(externalCandidateId: string): Promise<RawApplicantPayload> {
    return { external_candidate_id: externalCandidateId, name: "[MOCK] Candidate", email: "mock@example.com" };
  }

  /** Dev-only verification: a fixed shared-secret header check. Not a real
   * HMAC scheme — documented explicitly as non-production. */
  async verifyWebhookSignature(_rawBody: string, headers: Record<string, string>): Promise<boolean> {
    return headers["x-mock-webhook-secret"] === MOCK_WEBHOOK_SECRET;
  }
}

export const mockJobBoardConnector = new MockJobBoardConnector();
export { MOCK_WEBHOOK_SECRET };
