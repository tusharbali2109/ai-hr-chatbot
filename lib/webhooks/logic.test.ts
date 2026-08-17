import { describe, it, expect } from "vitest";
import { buildEventKey, computeBackoffDelayMs, isRetryExhausted } from "@/lib/webhooks/logic";

describe("buildEventKey", () => {
  it("combines platform and external event id, lowercasing the platform", () => {
    expect(buildEventKey("LinkedIn", "evt_123")).toBe("linkedin:evt_123");
  });
});

describe("computeBackoffDelayMs", () => {
  it("grows exponentially with attempt number", () => {
    const d1 = computeBackoffDelayMs(1)!;
    const d2 = computeBackoffDelayMs(2)!;
    const d3 = computeBackoffDelayMs(3)!;
    expect(d2).toBeGreaterThan(d1);
    expect(d3).toBeGreaterThan(d2);
  });

  it("returns null once the bounded attempt count is exceeded", () => {
    expect(computeBackoffDelayMs(0)).toBeNull();
    expect(computeBackoffDelayMs(999)).toBeNull();
  });
});

describe("isRetryExhausted", () => {
  it("is false while under the cap and true at/after it", () => {
    expect(isRetryExhausted(1)).toBe(false);
    expect(isRetryExhausted(5)).toBe(true);
    expect(isRetryExhausted(6)).toBe(true);
  });
});
