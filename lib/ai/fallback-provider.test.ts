import { describe, expect, it, vi } from "vitest";
import { createFallbackProvider } from "./fallback-provider";
import { AIServiceError } from "./errors";
import type { AIProvider } from "./provider";

/** Build an AIProvider whose named methods are the given stubs and whose
 * every other method throws if unexpectedly called. */
function providerWith(methods: Record<string, unknown>): AIProvider {
  return new Proxy(methods, {
    get(target, prop: string) {
      if (prop in target) return target[prop];
      return () => {
        throw new Error(`unexpected call to ${prop}`);
      };
    },
  }) as unknown as AIProvider;
}

describe("createFallbackProvider", () => {
  it("uses the primary result and never touches the secondary when Anthropic succeeds", async () => {
    const secondary = vi.fn(async () => "gemini");
    const provider = createFallbackProvider(
      providerWith({ explainCandidate: vi.fn(async () => "anthropic") }),
      providerWith({ explainCandidate: secondary })
    );

    await expect(provider.explainCandidate({} as never)).resolves.toBe("anthropic");
    expect(secondary).not.toHaveBeenCalled();
  });

  it("falls back to the secondary with the same arguments when the primary raises AIServiceError", async () => {
    const secondary = vi.fn(async () => "gemini");
    const provider = createFallbackProvider(
      providerWith({
        extractCandidateFromResume: vi.fn(async () => {
          throw new AIServiceError("insufficient credits");
        }),
      }),
      providerWith({ extractCandidateFromResume: secondary })
    );

    await expect(provider.extractCandidateFromResume("resume text")).resolves.toBe("gemini");
    expect(secondary).toHaveBeenCalledWith("resume text");
  });

  it("does not fall back for a non-AIServiceError (e.g. a model refusal / bug)", async () => {
    const secondary = vi.fn(async () => "gemini");
    const provider = createFallbackProvider(
      providerWith({
        evaluateCandidate: vi.fn(async () => {
          throw new Error("The AI declined to process this request.");
        }),
      }),
      providerWith({ evaluateCandidate: secondary })
    );

    await expect(provider.evaluateCandidate({} as never)).rejects.toThrow("declined");
    expect(secondary).not.toHaveBeenCalled();
  });

  it("surfaces the primary (Anthropic) error when the fallback also fails", async () => {
    const provider = createFallbackProvider(
      providerWith({
        generateJD: vi.fn(async () => {
          throw new AIServiceError("anthropic out of credits");
        }),
      }),
      providerWith({
        generateJD: vi.fn(async () => {
          throw new AIServiceError("gemini not configured");
        }),
      })
    );

    await expect(provider.generateJD({} as never)).rejects.toThrow("anthropic out of credits");
  });
});
