import { expect, it, vi } from "vitest";
import { actionResult } from "./action-result";
import { AIServiceError } from "./ai/errors";
it("returns expected AI failures without throwing across the server action boundary", async () => {
  await expect(actionResult(async () => { throw new AIServiceError("Insufficient credits"); })).resolves.toEqual({ ok: false, error: "Insufficient credits" });
});
it("does not leak unexpected database or provider error details", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    const result = await actionResult(async () => { throw new Error("sensitive database details"); });
    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).not.toContain("sensitive database details");
  } finally { log.mockRestore(); }
});
