import { describe, it, expect } from "vitest";
import { computeEventId } from "@/lib/orchestrator/event-store";

describe("computeEventId", () => {
  it("is stable for the same inputs", () => {
    const a = computeEventId("app-1", "candidate.screening.completed", "screening-1");
    const b = computeEventId("app-1", "candidate.screening.completed", "screening-1");
    expect(a).toBe(b);
  });

  it("differs when the source id changes (a re-screen produces a distinct event)", () => {
    const a = computeEventId("app-1", "candidate.screening.completed", "screening-1");
    const b = computeEventId("app-1", "candidate.screening.completed", "screening-2");
    expect(a).not.toBe(b);
  });

  it("differs when the event type changes", () => {
    const a = computeEventId("app-1", "candidate.screening.completed", "x");
    const b = computeEventId("app-1", "candidate.interview.completed", "x");
    expect(a).not.toBe(b);
  });

  it("differs when the application id changes", () => {
    const a = computeEventId("app-1", "candidate.screening.completed", "x");
    const b = computeEventId("app-2", "candidate.screening.completed", "x");
    expect(a).not.toBe(b);
  });
});
