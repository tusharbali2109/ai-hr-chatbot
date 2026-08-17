import type { WorkingHoursBlock, CandidateAvailability } from "@/lib/types/database";
import type { BusyInterval } from "@/lib/scheduling/calendar-provider";

export interface UtcInterval {
  start: string;
  end: string;
}

export interface DateRange {
  fromIso: string;
  toIso: string;
}

/**
 * Resolves the UTC offset (minutes) of an IANA timezone at a given instant,
 * via Intl's real timezone database — not manual string arithmetic, so DST
 * transitions are handled correctly (spec §14: "never blindly manipulate
 * date strings").
 */
export function getTimezoneOffsetMinutes(utcDate: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = dtf.formatToParts(utcDate).reduce<Record<string, string>>((acc, p) => {
    acc[p.type] = p.value;
    return acc;
  }, {});
  const asIfUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
  return (asIfUtc - utcDate.getTime()) / 60000;
}

/** Converts a local wall-clock date+time in `timeZone` to a UTC ISO instant. */
export function zonedTimeToUtcIso(dateStr: string, timeStr: string, timeZone: string): string {
  const naiveUtc = new Date(`${dateStr}T${timeStr}:00Z`);
  const offsetMin = getTimezoneOffsetMinutes(naiveUtc, timeZone);
  return new Date(naiveUtc.getTime() - offsetMin * 60000).toISOString();
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function dayOfWeekInTimezone(utcIso: string, timeZone: string): number {
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).format(new Date(utcIso));
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return map[weekday];
}

/** Expands a weekly-recurring working-hours pattern into concrete UTC
 * intervals across the given date range. */
export function workingHoursToUtcIntervals(blocks: WorkingHoursBlock[], range: DateRange, timeZone: string): UtcInterval[] {
  if (blocks.length === 0) return [];
  const intervals: UtcInterval[] = [];
  let cursor = range.fromIso.slice(0, 10);
  const endDate = range.toIso.slice(0, 10);

  // Walk one extra day past the range end to catch a block whose local
  // start date (in timeZone) lags a day behind the UTC range boundary.
  while (cursor <= endDate) {
    const localDow = dayOfWeekInTimezone(`${cursor}T12:00:00Z`, timeZone);
    for (const block of blocks) {
      if (block.day_of_week !== localDow) continue;
      const start = zonedTimeToUtcIso(cursor, block.start, timeZone);
      const end = zonedTimeToUtcIso(cursor, block.end, timeZone);
      if (start < range.toIso && end > range.fromIso) {
        intervals.push({ start, end });
      }
    }
    cursor = addDays(cursor, 1);
  }
  return intervals.sort((a, b) => a.start.localeCompare(b.start));
}

export function candidateAvailabilityToUtcIntervals(availability: CandidateAvailability[], range: DateRange): UtcInterval[] {
  const blocks: WorkingHoursBlock[] = availability.map((a) => ({ day_of_week: a.day_of_week, start: a.start_time.slice(0, 5), end: a.end_time.slice(0, 5) }));
  // Availability rows can carry different timezones in principle, but in
  // practice a candidate has one; group by timezone to convert correctly.
  const byTimezone = new Map<string, WorkingHoursBlock[]>();
  availability.forEach((a, i) => {
    const list = byTimezone.get(a.timezone) ?? [];
    list.push(blocks[i]);
    byTimezone.set(a.timezone, list);
  });
  return [...byTimezone.entries()].flatMap(([timezone, tzBlocks]) => workingHoursToUtcIntervals(tzBlocks, range, timezone));
}

/** Sorted-sweep intersection of two interval lists. */
export function intersectIntervals(a: UtcInterval[], b: UtcInterval[]): UtcInterval[] {
  const result: UtcInterval[] = [];
  for (const x of a) {
    for (const y of b) {
      const start = x.start > y.start ? x.start : y.start;
      const end = x.end < y.end ? x.end : y.end;
      if (start < end) result.push({ start, end });
    }
  }
  return result.sort((p, q) => p.start.localeCompare(q.start));
}

/** Removes any portion of `intervals` that overlaps a busy interval —
 * this is what turns "theoretically available" into "actually free on the
 * calendar". */
export function subtractBusyIntervals(intervals: UtcInterval[], busy: BusyInterval[]): UtcInterval[] {
  let remaining = intervals;
  for (const b of busy) {
    const next: UtcInterval[] = [];
    for (const interval of remaining) {
      if (b.end <= interval.start || b.start >= interval.end) {
        next.push(interval);
        continue;
      }
      if (b.start > interval.start) next.push({ start: interval.start, end: b.start < interval.end ? b.start : interval.end });
      if (b.end < interval.end) next.push({ start: b.end > interval.start ? b.end : interval.start, end: interval.end });
    }
    remaining = next;
  }
  return remaining.filter((i) => i.start < i.end);
}

/** Shrinks each interval by bufferMinutes on both ends — the pre/post
 * meeting buffer (spec §9). */
export function applyBuffer(intervals: UtcInterval[], bufferMinutes: number): UtcInterval[] {
  const ms = bufferMinutes * 60000;
  return intervals
    .map((i) => ({ start: new Date(new Date(i.start).getTime() + ms).toISOString(), end: new Date(new Date(i.end).getTime() - ms).toISOString() }))
    .filter((i) => i.start < i.end);
}

/** Chops available windows into discrete, non-overlapping bookable slots
 * of exactly `durationMinutes`. */
export function generateSlots(intervals: UtcInterval[], durationMinutes: number): UtcInterval[] {
  const ms = durationMinutes * 60000;
  const slots: UtcInterval[] = [];
  for (const interval of intervals) {
    let cursor = new Date(interval.start).getTime();
    const end = new Date(interval.end).getTime();
    while (cursor + ms <= end) {
      slots.push({ start: new Date(cursor).toISOString(), end: new Date(cursor + ms).toISOString() });
      cursor += ms;
    }
  }
  return slots;
}
