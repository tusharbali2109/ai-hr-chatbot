import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/services/jobs", () => ({ getJob: vi.fn(async () => ({ title: "Engineer", screening_criteria: { mandatory: [], preferred: [] } })) }));
vi.mock("@/lib/services/candidates", () => ({ getCandidate: vi.fn(async () => ({ name: "Candidate", phone: "+919876543210", resume_url: "resume.txt" })) }));
vi.mock("@/lib/services/applications", () => ({ getApplication: vi.fn(async () => ({ job_id: "job", candidate_id: "candidate", current_stage: "SHORTLISTED" })), updateApplicationStage: vi.fn() }));
vi.mock("@/lib/services/jd", () => ({ getAuthedCompanyId: vi.fn(async () => ({ companyId: "company" })), assertJobOwnership: vi.fn(), getApprovedJdVersion: vi.fn() }));
vi.mock("@/lib/services/screening", () => ({ getLatestScreening: vi.fn() }));
vi.mock("@/lib/services/agent-runs", () => ({ hasActiveRun: vi.fn(async () => false), createAgentRun: vi.fn(async () => ({ id: "run" })), markAgentRunRunning: vi.fn(), markAgentRunCompleted: vi.fn(), markAgentRunFailed: vi.fn() }));
vi.mock("@/lib/services/interviews", () => ({ createInterview: vi.fn(async () => ({ id: "interview" })), createInterviewQuestion: vi.fn(), getInterview: vi.fn(), getLatestInterview: vi.fn(), updateInterview: vi.fn() }));
vi.mock("@/lib/services/ingestion", () => ({ logInternalEvent: vi.fn() }));
vi.mock("@/lib/files/resume-text", () => ({ fetchCandidateResumeText: vi.fn(async () => "Built a payments API using Node.js") }));
const mocks = vi.hoisted(() => ({ question: vi.fn(async () => ({ question: "How did you build the payments API?", category: "Experience" })), call: vi.fn(async () => ({ externalCallId: "CA123", status: "queued", completedSynchronously: false })) }));
vi.mock("@/lib/ai", () => ({ getAIProvider: () => ({ generateInterviewPlan: vi.fn(), generateQuestion: mocks.question }) }));
vi.mock("@/lib/interview/registry", () => ({ getVoiceProvider: () => ({ name: "twilio", createOutboundCall: mocks.call }) }));

import { triggerInterview } from "./agent";
import { updateInterview, createInterview } from "@/lib/services/interviews";
import { fetchCandidateResumeText } from "@/lib/files/resume-text";

describe("phone interview setup", () => {
  beforeEach(() => vi.clearAllMocks());
  it("persists the provider call ID and passes resume context to every question", async () => {
    await triggerInterview("application");
    expect(updateInterview).toHaveBeenCalledWith("interview", { external_call_id: "CA123" });
    expect(mocks.question).toHaveBeenCalledTimes(2);
    for (const [input] of mocks.question.mock.calls as unknown as [{ resumeText: string }][]) {
      expect(input.resumeText).toContain("payments API");
    }
  });
  it("does not dial or create an interview when the resume cannot be read", async () => {
    vi.mocked(fetchCandidateResumeText).mockResolvedValueOnce(undefined);
    await expect(triggerInterview("application")).rejects.toThrow("readable resume");
    expect(mocks.call).not.toHaveBeenCalled();
    expect(createInterview).not.toHaveBeenCalled();
  });
});
