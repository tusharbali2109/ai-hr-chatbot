import { afterEach, expect, it, vi } from "vitest";
import Anthropic from "@anthropic-ai/sdk";
import { Messages } from "@anthropic-ai/sdk/resources/messages";
import { anthropicProvider } from "./anthropic-provider";
import { aiServiceError } from "./errors";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

it("reports credit exhaustion without retrying it as malformed output", async () => {
  vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
  const request = vi.spyOn(Messages.prototype, "create").mockRejectedValue(Anthropic.APIError.generate(400, { error: { type: "invalid_request_error", message: "Your credit balance is too low to access the Anthropic API" } }, undefined, new Headers()));
  await expect(anthropicProvider.extractCandidateFromResume("Resume text")).rejects.toThrow("insufficient credits");
  expect(request).toHaveBeenCalledTimes(1);
});

it("retries actual malformed output and accepts the next valid result", async () => {
  vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
  const data = { name: "Test Candidate", email: "test@example.com", phone: null, location: null, linkedin_url: null, portfolio_url: null };
  const request = vi.spyOn(Messages.prototype, "create")
    .mockResolvedValueOnce({ content: [{ type: "text", text: "invalid json" }] } as never)
    .mockResolvedValueOnce({ content: [{ type: "text", text: JSON.stringify(data) }] } as never);
  await expect(anthropicProvider.extractCandidateFromResume("Resume text")).resolves.toEqual(data);
  expect(request).toHaveBeenCalledTimes(2);
});

it.each([401, 403, 429, 500])("does not expose raw provider details for status %s", (status) => {
  const result = aiServiceError(new Anthropic.APIError(status, {}, "private provider details", new Headers()));
  expect(result.message).not.toContain("private provider details");
});
