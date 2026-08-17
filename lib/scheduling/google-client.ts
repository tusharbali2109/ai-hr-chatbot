import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getCalendarConnectionWithSecrets,
  upsertCalendarConnectionTokens,
  markCalendarConnectionError,
} from "@/lib/services/scheduling";
import { refreshAccessToken } from "@/lib/oauth/google-calendar";
import { CalendarNotConnectedError } from "@/lib/scheduling/calendar-provider";
import type { CalendarProvider, BusyInterval, CalendarEventResult } from "@/lib/scheduling/calendar-provider";

const CALENDAR_API = "https://www.googleapis.com/calendar/v3";
const REFRESH_MARGIN_MS = 2 * 60 * 1000;

/** Loads a valid (auto-refreshed if near expiry) access token for an
 * interviewer's connected calendar. Throws CalendarNotConnectedError if no
 * connection exists or the connection is in an error state — this is the
 * single source of the "Calendar Not Connected" UI state; nothing upstream
 * of this function is allowed to fabricate availability. */
async function getValidAccessToken(interviewerId: string, client?: SupabaseClient): Promise<{ accessToken: string; calendarId: string }> {
  const connection = await getCalendarConnectionWithSecrets(interviewerId, client);
  if (!connection || connection.status !== "connected" || !connection.access_token) {
    throw new CalendarNotConnectedError(interviewerId);
  }

  const expiresAt = connection.token_expires_at ? new Date(connection.token_expires_at).getTime() : 0;
  if (expiresAt - Date.now() > REFRESH_MARGIN_MS) {
    return { accessToken: connection.access_token, calendarId: connection.interviewer_id };
  }

  if (!connection.refresh_token) {
    await markCalendarConnectionError(interviewerId, "Access token expired and no refresh token is on file — reconnect required.", client);
    throw new CalendarNotConnectedError(interviewerId);
  }

  try {
    const refreshed = await refreshAccessToken(connection.refresh_token);
    await upsertCalendarConnectionTokens(
      {
        interviewerId,
        companyId: connection.company_id,
        accessToken: refreshed.accessToken,
        refreshToken: null,
        tokenExpiresAt: refreshed.expiresAt,
        scope: refreshed.scope,
      },
      client
    );
    return { accessToken: refreshed.accessToken, calendarId: connection.interviewer_id };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Token refresh failed.";
    await markCalendarConnectionError(interviewerId, message, client);
    throw new CalendarNotConnectedError(interviewerId);
  }
}

async function googleFetch(accessToken: string, path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${CALENDAR_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
}

/** Real Google Calendar v3 client — plain fetch, no googleapis dependency.
 * Every method requires a connected interviewer and never returns a
 * fabricated result; a REST/API failure is always surfaced as a thrown
 * error, never swallowed into a false "available"/"created" result. */
export const googleCalendarProvider: CalendarProvider = {
  async getFreeBusy(interviewerId, calendarId, timeMinIso, timeMaxIso, client?: SupabaseClient): Promise<BusyInterval[]> {
    const { accessToken } = await getValidAccessToken(interviewerId, client);
    const res = await googleFetch(accessToken, "/freeBusy", {
      method: "POST",
      body: JSON.stringify({ timeMin: timeMinIso, timeMax: timeMaxIso, items: [{ id: calendarId }] }),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error?.message ?? `Google freeBusy request failed (${res.status}).`);

    const busy = body.calendars?.[calendarId]?.busy ?? [];
    return busy.map((b: { start: string; end: string }) => ({ start: b.start, end: b.end }));
  },

  async createEvent(interviewerId, input, client?: SupabaseClient): Promise<CalendarEventResult> {
    const { accessToken } = await getValidAccessToken(interviewerId, client);
    const res = await googleFetch(accessToken, `/calendars/${encodeURIComponent(input.calendarId)}/events?conferenceDataVersion=1`, {
      method: "POST",
      body: JSON.stringify({
        summary: input.summary,
        description: input.description,
        start: { dateTime: input.startTime, timeZone: input.timezone },
        end: { dateTime: input.endTime, timeZone: input.timezone },
        attendees: input.attendeeEmails.map((email) => ({ email })),
        conferenceData: {
          createRequest: { requestId: `${Date.now()}`, conferenceSolutionKey: { type: "hangoutsMeet" } },
        },
      }),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error?.message ?? `Google event creation failed (${res.status}).`);

    return {
      externalEventId: body.id,
      meetingUrl: body.hangoutLink ?? body.conferenceData?.entryPoints?.[0]?.uri ?? null,
    };
  },

  async updateEvent(interviewerId, externalEventId, patch, client?: SupabaseClient): Promise<CalendarEventResult> {
    const { accessToken, calendarId: fallbackCalendarId } = await getValidAccessToken(interviewerId, client);
    const calendarId = patch.calendarId ?? fallbackCalendarId;
    const body: Record<string, unknown> = {};
    if (patch.summary) body.summary = patch.summary;
    if (patch.description) body.description = patch.description;
    if (patch.startTime) body.start = { dateTime: patch.startTime, timeZone: patch.timezone };
    if (patch.endTime) body.end = { dateTime: patch.endTime, timeZone: patch.timezone };
    if (patch.attendeeEmails) body.attendees = patch.attendeeEmails.map((email) => ({ email }));

    const res = await googleFetch(accessToken, `/calendars/${encodeURIComponent(calendarId)}/events/${externalEventId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
    const responseBody = await res.json();
    if (!res.ok) throw new Error(responseBody.error?.message ?? `Google event update failed (${res.status}).`);

    return {
      externalEventId: responseBody.id,
      meetingUrl: responseBody.hangoutLink ?? null,
    };
  },

  async deleteEvent(interviewerId, calendarId, externalEventId, client?: SupabaseClient): Promise<void> {
    const { accessToken } = await getValidAccessToken(interviewerId, client);
    const res = await googleFetch(accessToken, `/calendars/${encodeURIComponent(calendarId)}/events/${externalEventId}`, {
      method: "DELETE",
    });
    if (!res.ok && res.status !== 404 && res.status !== 410) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error?.message ?? `Google event deletion failed (${res.status}).`);
    }
  },
};
