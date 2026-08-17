import type { RawApplicantPayload } from "@/lib/ingestion/logic";

export interface JobBoardCapabilities {
  canCreateJob: boolean;
  canUpdateJob: boolean;
  canCloseJob: boolean;
  canFetchApplications: boolean;
  canReceiveWebhooks: boolean;
}

export interface JobPostingInput {
  title: string;
  description: string;
  location: string;
  employmentType: string;
  experienceMin: number;
  experienceMax: number;
  requiredSkills: string[];
}

export interface ExternalJobStatus {
  externalJobId: string;
  status: string;
  externalUrl: string | null;
}

export interface ConnectionCheckResult {
  connected: boolean;
  error?: string;
}

export interface ApplicationsPage {
  applications: RawApplicantPayload[];
  nextCursor: string | null;
}

/**
 * Generic contract every job board integration implements. Platform-specific
 * API details live only inside a connector's own file — nothing else in the
 * app (agent, services, actions, UI) knows how any particular platform works.
 */
export interface JobBoardConnector {
  readonly platform: string;
  readonly capabilities: JobBoardCapabilities;

  checkConnection(companyId: string): Promise<ConnectionCheckResult>;
  createJob(job: JobPostingInput): Promise<{ externalJobId: string; externalUrl: string | null }>;
  updateJob(externalJobId: string, job: JobPostingInput): Promise<void>;
  closeJob(externalJobId: string): Promise<void>;
  getJob(externalJobId: string): Promise<ExternalJobStatus>;
  getApplications(externalJobId: string, cursor?: string | null): Promise<ApplicationsPage>;
  getApplication(externalApplicationId: string): Promise<RawApplicantPayload>;
  getCandidate(externalCandidateId: string): Promise<RawApplicantPayload>;
  verifyWebhookSignature(rawBody: string, headers: Record<string, string>): Promise<boolean>;
}

export class CapabilityUnavailableError extends Error {
  constructor(platform: string, capability: keyof JobBoardCapabilities) {
    super(`API capability unavailable: ${platform} does not support "${capability}".`);
    this.name = "CapabilityUnavailableError";
  }
}

export class IntegrationNotConfiguredError extends Error {
  constructor(platform: string) {
    super(`Integration not configured: ${platform} has no valid connection for this company.`);
    this.name = "IntegrationNotConfiguredError";
  }
}

/**
 * Every connector method that maps to a capability flag must be guarded by
 * this — unsupported operations fail with a clear, typed error instead of
 * silently no-opping or faking a result.
 */
export function assertCapability(connector: JobBoardConnector, capability: keyof JobBoardCapabilities): void {
  if (!connector.capabilities[capability]) {
    throw new CapabilityUnavailableError(connector.platform, capability);
  }
}
