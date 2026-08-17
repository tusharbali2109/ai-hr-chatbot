import { describe, it, expect } from "vitest";
import {
  getTimezoneOffsetMinutes,
  zonedTimeToUtcIso,
  workingHoursToUtcIntervals,
  candidateAvailabilityToUtcIntervals,
  intersectIntervals,
  subtractBusyIntervals,
  applyBuffer,
  generateSlots,
} from "@/lib/scheduling/logic";

describe("getTimezoneOffsetMinutes", () => {
  it("resolves IST as UTC+5:30", () => {
    expect(getTimezoneOffsetMinutes(new Date("2026-06-15T00:00:00Z"), "Asia/Kolkata")).toBe(330);
  });

  it("resolves a fixed-offset zone correctly", () => {
    expect(getTimezoneOffsetMinutes(new Date("2026-06-15T00:00:00Z"), "UTC")).toBe(0);
  });
});

describe("zonedTimeToUtcIso", () => {
  it("converts IST 10:00 to the correct UTC instant", () => {
    // 10:00 IST = 04:30 UTC (UTC+5:30)
    expect(zonedTimeToUtcIso("2026-06-15", "10:00", "Asia/Kolkata")).toBe("2026-06-15T04:30:00.000Z");
  });

  it("handles a US timezone with a negative offset", () => {
    // 09:00 America/New_York in June (EDT, UTC-4) = 13:00 UTC
    expect(zonedTimeToUtcIso("2026-06-15", "09:00", "America/New_York")).toBe("2026-06-15T13:00:00.000Z");
  });
});

describe("workingHoursToUtcIntervals", () => {
  it("expands a weekly block across a date range", () => {
    // Monday 10:00-18:00 IST
    const blocks = [{ day_of_week: 1, start: "10:00", end: "18:00" }];
    const range = { fromIso: "2026-06-15T00:00:00.000Z", toIso: "2026-06-22T00:00:00.000Z" }; // Mon 15th is a Monday
    const intervals = workingHoursToUtcIntervals(blocks, range, "Asia/Kolkata");
    expect(intervals).toHaveLength(1);
    expect(intervals[0]).toEqual({ start: "2026-06-15T04:30:00.000Z", end: "2026-06-15T12:30:00.000Z" });
  });

  it("returns no intervals for an empty working-hours list", () => {
    expect(workingHoursToUtcIntervals([], { fromIso: "2026-06-15T00:00:00.000Z", toIso: "2026-06-22T00:00:00.000Z" }, "UTC")).toEqual([]);
  });
});

describe("candidateAvailabilityToUtcIntervals", () => {
  it("converts candidate availability rows grouped by timezone", () => {
    const availability = [
      { id: "1", application_id: "a", day_of_week: 1, start_time: "10:00:00", end_time: "16:00:00", timezone: "Asia/Kolkata", created_at: "" },
    ];
    const range = { fromIso: "2026-06-15T00:00:00.000Z", toIso: "2026-06-16T00:00:00.000Z" };
    const intervals = candidateAvailabilityToUtcIntervals(availability, range);
    expect(intervals).toEqual([{ start: "2026-06-15T04:30:00.000Z", end: "2026-06-15T10:30:00.000Z" }]);
  });
});

describe("intersectIntervals", () => {
  it("finds the overlap between two interval sets", () => {
    const a = [{ start: "2026-06-15T04:00:00.000Z", end: "2026-06-15T10:00:00.000Z" }];
    const b = [{ start: "2026-06-15T08:00:00.000Z", end: "2026-06-15T12:00:00.000Z" }];
    expect(intersectIntervals(a, b)).toEqual([{ start: "2026-06-15T08:00:00.000Z", end: "2026-06-15T10:00:00.000Z" }]);
  });

  it("returns empty when there's no overlap", () => {
    const a = [{ start: "2026-06-15T04:00:00.000Z", end: "2026-06-15T05:00:00.000Z" }];
    const b = [{ start: "2026-06-15T08:00:00.000Z", end: "2026-06-15T09:00:00.000Z" }];
    expect(intersectIntervals(a, b)).toEqual([]);
  });
});

describe("subtractBusyIntervals — double-booking prevention", () => {
  it("removes a busy period from the middle of an available window", () => {
    const available = [{ start: "2026-06-15T04:00:00.000Z", end: "2026-06-15T10:00:00.000Z" }];
    const busy = [{ start: "2026-06-15T06:00:00.000Z", end: "2026-06-15T07:00:00.000Z" }];
    expect(subtractBusyIntervals(available, busy)).toEqual([
      { start: "2026-06-15T04:00:00.000Z", end: "2026-06-15T06:00:00.000Z" },
      { start: "2026-06-15T07:00:00.000Z", end: "2026-06-15T10:00:00.000Z" },
    ]);
  });

  it("removes the entire window when fully busy", () => {
    const available = [{ start: "2026-06-15T04:00:00.000Z", end: "2026-06-15T10:00:00.000Z" }];
    const busy = [{ start: "2026-06-15T03:00:00.000Z", end: "2026-06-15T11:00:00.000Z" }];
    expect(subtractBusyIntervals(available, busy)).toEqual([]);
  });

  it("leaves the window untouched when busy doesn't overlap", () => {
    const available = [{ start: "2026-06-15T04:00:00.000Z", end: "2026-06-15T10:00:00.000Z" }];
    const busy = [{ start: "2026-06-15T11:00:00.000Z", end: "2026-06-15T12:00:00.000Z" }];
    expect(subtractBusyIntervals(available, busy)).toEqual(available);
  });
});

describe("applyBuffer", () => {
  it("shrinks each interval by the buffer on both ends", () => {
    const intervals = [{ start: "2026-06-15T04:00:00.000Z", end: "2026-06-15T05:00:00.000Z" }];
    expect(applyBuffer(intervals, 15)).toEqual([{ start: "2026-06-15T04:15:00.000Z", end: "2026-06-15T04:45:00.000Z" }]);
  });

  it("drops an interval that becomes inverted after buffering", () => {
    const intervals = [{ start: "2026-06-15T04:00:00.000Z", end: "2026-06-15T04:10:00.000Z" }];
    expect(applyBuffer(intervals, 15)).toEqual([]);
  });
});

describe("generateSlots", () => {
  it("chops a window into fixed-duration non-overlapping slots", () => {
    const intervals = [{ start: "2026-06-15T04:00:00.000Z", end: "2026-06-15T05:30:00.000Z" }];
    expect(generateSlots(intervals, 30)).toEqual([
      { start: "2026-06-15T04:00:00.000Z", end: "2026-06-15T04:30:00.000Z" },
      { start: "2026-06-15T04:30:00.000Z", end: "2026-06-15T05:00:00.000Z" },
      { start: "2026-06-15T05:00:00.000Z", end: "2026-06-15T05:30:00.000Z" },
    ]);
  });

  it("drops a trailing remainder shorter than the duration", () => {
    const intervals = [{ start: "2026-06-15T04:00:00.000Z", end: "2026-06-15T04:45:00.000Z" }];
    expect(generateSlots(intervals, 30)).toEqual([{ start: "2026-06-15T04:00:00.000Z", end: "2026-06-15T04:30:00.000Z" }]);
  });
});
