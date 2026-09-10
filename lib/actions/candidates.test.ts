import { beforeEach, expect, it, vi } from "vitest";
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/services/jd", () => ({ getAuthedCompanyId: vi.fn(async () => ({ companyId: "company" })), assertJobOwnership: vi.fn() }));
vi.mock("@/lib/services/ingestion", () => ({ ingestApplicant: vi.fn() }));
vi.mock("@/lib/services/auth", () => ({ requireAdmin: vi.fn() }));
const mocks = vi.hoisted(() => ({ extract: vi.fn() }));
vi.mock("@/lib/ai", () => ({ getAIProvider: () => ({ extractCandidateFromResume: mocks.extract }) }));
vi.mock("@/lib/files/text-extraction", () => ({ extractTextFromFile: vi.fn(async () => "Resume text") }));
import { extractCandidateFromResumeAction } from "./candidates";
import { AIServiceError } from "@/lib/ai/errors";
import { extractTextFromFile } from "@/lib/files/text-extraction";

beforeEach(() => vi.clearAllMocks());
function resume() { const data = new FormData(); data.set("resume", new File(["Resume"], "resume.txt", { type: "text/plain" })); return data; }

it("returns billing errors as serializable data, avoiding production React error masking", async () => {
  mocks.extract.mockRejectedValueOnce(new AIServiceError("Insufficient credits."));
  await expect(extractCandidateFromResumeAction(resume())).resolves.toEqual({ ok: false, error: "Insufficient credits. You can enter the details manually and save the resume." });
});
it("returns a readable error for an unreadable file without calling AI", async () => {
  vi.mocked(extractTextFromFile).mockRejectedValueOnce(new Error("private parser details"));
  const result = await extractCandidateFromResumeAction(resume());
  expect(result.ok).toBe(false);
  expect(JSON.stringify(result)).not.toContain("private parser details");
  expect(mocks.extract).not.toHaveBeenCalled();
});
it("returns successful extracted fields", async () => {
  const data = { name: "Test", email: "test@example.com", phone: null, location: null, linkedin_url: null, portfolio_url: null };
  mocks.extract.mockResolvedValueOnce(data);
  await expect(extractCandidateFromResumeAction(resume())).resolves.toEqual({ ok: true, data });
});
it("returns validation errors instead of throwing", async () => {
  await expect(extractCandidateFromResumeAction(new FormData())).resolves.toMatchObject({ ok: false });
});
