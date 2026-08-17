import { describe, it, expect } from "vitest";
import { getCodeExecutionProvider } from "@/lib/assessment/code-execution/registry";
import { CodeExecutionNotConfiguredError } from "@/lib/assessment/code-execution/provider";

describe("code execution provider registry", () => {
  it("defaults to the unconfigured provider", () => {
    const provider = getCodeExecutionProvider();
    expect(provider.name).toBe("unconfigured");
    expect(provider.configured).toBe(false);
  });

  it("throws CodeExecutionNotConfiguredError on execute", async () => {
    const provider = getCodeExecutionProvider();
    await expect(
      provider.execute({ language: "python", code: "print(1)", testCases: [], timeLimitMs: 1000, memoryLimitMb: 128 })
    ).rejects.toBeInstanceOf(CodeExecutionNotConfiguredError);
  });
});
