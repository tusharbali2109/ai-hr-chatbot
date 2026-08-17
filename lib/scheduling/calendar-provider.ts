import type { SupabaseClient } from "@supabase/supabase-js";

export interface BusyInterval {
  start: string; // ISO 8601 UTC
  end: string;
}

export interface CreateCalendarEventInput {
  calendarId: string;
  summary: string;
  description: string;
  startTime: string; // ISO 8601 UTC
  endTime: string;
  timezone: string;
  attendeeEmails: string[];
}

export interface CalendarEventResult {
  externalEventId: string;
  meetingUrl: string | null;
}

export class CalendarNotConnectedError extends Error {
  constructor(interviewerId: string) {
    super(`Calendar Not Connected — interviewer ${interviewerId} has not connected Google Calendar.`);
    this.name = "CalendarNotConnectedError";
  }
}

/**
 * Contract for a real calendar integration. Uses the official Google
 * Calendar REST API v3 (no scraping, no faked availability — an
 * implementation that can't reach the API must throw, never return a made-
 * up free/busy result).
 */
export interface CalendarProvider {
  getFreeBusy(interviewerId: string, calendarId: string, timeMinIso: string, timeMaxIso: string, client?: SupabaseClient): Promise<BusyInterval[]>;
  createEvent(interviewerId: string, input: CreateCalendarEventInput, client?: SupabaseClient): Promise<CalendarEventResult>;
  updateEvent(
    interviewerId: string,
    externalEventId: string,
    patch: Partial<CreateCalendarEventInput>,
    client?: SupabaseClient
  ): Promise<CalendarEventResult>;
  deleteEvent(interviewerId: string, calendarId: string, externalEventId: string, client?: SupabaseClient): Promise<void>;
}
