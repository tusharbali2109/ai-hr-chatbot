import { beforeEach, expect, it, vi } from "vitest";
vi.mock("@/lib/interview/twilio-signature", () => ({ verifyTwilioSignature: () => true }));
vi.mock("@/lib/supabase/webhook-client", () => ({ createWebhookClient: () => ({}) }));
vi.mock("@/lib/services/interviews", () => ({
  getInterviewByExternalCallId: vi.fn(async () => ({ id: "i", consent_status: "GRANTED", current_question_index: 0 })),
  getInterviewContext: vi.fn(async () => ({ screeningCriteria: {}, candidateName: "Candidate" })),
  listInterviewQuestions: vi.fn(async () => [
    { id: "q", question_type: "PRIMARY", sequence: 1, question: "How did you build the payments API?" },
  ]),
  updateInterview: vi.fn(), logInterviewEvent: vi.fn(), createInterviewQuestion: vi.fn(), createInterviewAnswer: vi.fn(), finalizeInterview: vi.fn(),
}));
vi.mock("@/lib/interview/conversation", () => ({ processTurn: vi.fn() }));
vi.mock("@/lib/ai", () => ({ getAIProvider: vi.fn() }));
vi.mock("@/lib/ai/anthropic-provider", () => ({ MODEL: "test" }));
vi.mock("@/lib/services/applications", () => ({ updateApplicationStage: vi.fn() }));
vi.mock("@/lib/services/ingestion", () => ({ logInternalEvent: vi.fn() }));
import { POST } from "./route";
import { getInterviewByExternalCallId, listInterviewQuestions } from "@/lib/services/interviews";
import { processTurn } from "@/lib/interview/conversation";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("TWILIO_AUTH_TOKEN", "test");
  vi.stubEnv("TWILIO_VOICE_WEBHOOK_BASE_URL", "https://example.com");
});
const request = (speech = "") => new Request("https://example.com/api/webhooks/twilio/voice", { method: "POST", body: new URLSearchParams({ CallSid: "CA123", SpeechResult: speech }) });
it("repeats the resume question after silence without evaluating an empty answer", async () => {
  const xml = await (await POST(request())).text();
  expect(xml).toContain("How did you build the payments API?");
  expect(xml).toContain('actionOnEmptyResult="true"');
  expect(xml).not.toContain("<Hangup");
  expect(processTurn).not.toHaveBeenCalled();
});
it("repeats the pending follow-up after silence", async () => {
  vi.mocked(listInterviewQuestions).mockResolvedValueOnce([
    { id: "q", question_type: "PRIMARY", sequence: 1, question: "Primary" },
    { id: "f", question_type: "FOLLOWUP", parent_question_id: "q", sequence: 1001, question: "How did you measure API latency?" },
  ] as never);
  expect(await (await POST(request())).text()).toContain("How did you measure API latency?");
});
it("asks the first saved resume question after consent", async () => {
  vi.mocked(getInterviewByExternalCallId).mockResolvedValueOnce({ id: "i", consent_status: "PENDING", current_question_index: 0 } as never);
  const xml = await (await POST(request("yes"))).text();
  expect(xml).toContain("How did you build the payments API?");
  expect(xml).not.toContain("<Hangup");
});
