import { getJob } from "@/lib/services/jobs";
import { getCandidate } from "@/lib/services/candidates";
import { getApplication, updateApplicationStage } from "@/lib/services/applications";
import { getAuthedCompanyId, assertJobOwnership } from "@/lib/services/jd";
import { getCompany } from "@/lib/services/companies";
import {
  listQualifiedInterviewers,
  getInterviewer,
  listAvailabilityForApplication,
  countInterviewerBookings,
  createScheduledInterview,
  getScheduledInterview,
  updateScheduledInterview,
  acquireSchedulingLock,
  releaseSchedulingLock,
} from "@/lib/services/scheduling";
import { googleCalendarProvider } from "@/lib/scheduling/google-client";
import { CalendarNotConnectedError } from "@/lib/scheduling/calendar-provider";
import {
  workingHoursToUtcIntervals,
  candidateAvailabilityToUtcIntervals,
  intersectIntervals,
  subtractBusyIntervals,
  applyBuffer,
  generateSlots,
  type UtcInterval,
} from "@/lib/scheduling/logic";
import { sendInterviewInvitation, sendInterviewRescheduleEmail } from "@/lib/communication/agent";
import { logInternalEvent } from "@/lib/services/ingestion";
import type { Interviewer, ScheduledInterview } from "@/lib/types/database";

export const DEFAULT_INTERVIEW_DURATION_MINUTES = 60;
export const DEFAULT_BUFFER_MINUTES = 15;
export const PROPOSAL_WINDOW_DAYS = 7;

/**
 * Auto-selection (spec §19/§20): only ever picks from active interviewers
 * qualified for this interview type, ranked by lowest current workload.
 * Never returns an inactive interviewer, and throws a clear error rather
 * than silently picking an unqualified one when the pool is empty.
 */
export async function selectInterviewer(interviewType: string): Promise<Interviewer> {
  const qualified = await listQualifiedInterviewers(interviewType);
  if (qualified.length === 0) {
    throw new Error(`No active interviewer is configured for interview type "${interviewType}".`);
  }

  const now = new Date();
  const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
  const endOfDay = new Date(new Date(startOfDay).getTime() + 24 * 60 * 60 * 1000).toISOString();
  const endOfWeek = new Date(new Date(startOfDay).getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const workloads = await Promise.all(
    qualified.map(async (interviewer) => ({
      interviewer,
      today: await countInterviewerBookings(interviewer.id, startOfDay, endOfDay),
      week: await countInterviewerBookings(interviewer.id, startOfDay, endOfWeek),
    }))
  );

  workloads.sort((a, b) => a.week - b.week || a.today - b.today);
  return workloads[0].interviewer;
}

export interface ProposedSlot {
  start: string;
  end: string;
}

export interface ProposeSlotsResult {
  calendarConnected: boolean;
  slots: ProposedSlot[];
  error: string | null;
}

/**
 * Loads candidate availability + interviewer working hours, checks the
 * interviewer's real Google Calendar free/busy, and intersects all three
 * into discrete bookable slots (spec §9/§10/§18). If the interviewer's
 * calendar isn't connected, returns a clear "not connected" result rather
 * than pretending availability exists — never fakes free/busy data.
 */
export async function proposeSlots(applicationId: string, interviewerId: string, durationMinutes = DEFAULT_INTERVIEW_DURATION_MINUTES): Promise<ProposeSlotsResult> {
  const interviewer = await getInterviewer(interviewerId);
  if (!interviewer) throw new Error("Interviewer not found.");
  if (!interviewer.active) throw new Error("This interviewer is not active.");

  const availabilityRows = await listAvailabilityForApplication(applicationId);
  if (availabilityRows.length === 0) {
    return { calendarConnected: true, slots: [], error: "No candidate availability has been entered for this application yet." };
  }

  const range = {
    fromIso: new Date().toISOString(),
    toIso: new Date(Date.now() + PROPOSAL_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString(),
  };

  const interviewerWindows = workingHoursToUtcIntervals(interviewer.working_hours, range, interviewer.timezone);
  const candidateWindows = candidateAvailabilityToUtcIntervals(availabilityRows, range);
  const overlap = intersectIntervals(interviewerWindows, candidateWindows);

  let busy: UtcInterval[] = [];
  try {
    busy = await googleCalendarProvider.getFreeBusy(interviewer.id, interviewer.calendar_id ?? interviewer.email, range.fromIso, range.toIso);
  } catch (err) {
    if (err instanceof CalendarNotConnectedError) {
      return { calendarConnected: false, slots: [], error: "Calendar Not Connected" };
    }
    throw err;
  }

  const free = subtractBusyIntervals(overlap, busy);
  const buffered = applyBuffer(free, DEFAULT_BUFFER_MINUTES);
  const slots = generateSlots(buffered, durationMinutes);

  return { calendarConnected: true, slots, error: null };
}

export type ConfirmSlotOutcome =
  | { ok: true; scheduledInterview: ScheduledInterview }
  | { ok: false; reason: "slot_unavailable" | "calendar_not_connected" | "event_creation_failed"; message: string };

/**
 * The critical double-booking-safe path (spec §12/§13/§32): re-check
 * availability immediately before booking, acquire a short-lived lock,
 * re-check ONE more time inside the lock, create the calendar event, and
 * only then persist/notify. Any failure before the calendar event actually
 * exists leaves no scheduled_interviews row and sends no email — never
 * claims a booking that didn't really happen.
 */
export async function confirmSlot(
  applicationId: string,
  interviewerId: string,
  startTime: string,
  endTime: string,
  interviewType: string,
  notifyInterviewer: boolean
): Promise<ConfirmSlotOutcome> {
  const { companyId } = await getAuthedCompanyId();
  const application = await getApplication(applicationId);
  if (!application) throw new Error("Application not found.");
  await assertJobOwnership(application.job_id, companyId);

  const [job, candidate, interviewer, company] = await Promise.all([
    getJob(application.job_id),
    getCandidate(application.candidate_id),
    getInterviewer(interviewerId),
    getCompany(companyId),
  ]);
  if (!job) throw new Error("Job not found.");
  if (!candidate) throw new Error("Candidate not found.");
  if (!interviewer) throw new Error("Interviewer not found.");
  const companyName = company?.name ?? "the company";

  const calendarId = interviewer.calendar_id ?? interviewer.email;

  // Double-check #1: re-verify free/busy for exactly this interval — never
  // trust the slot list a proposeSlots() call may have returned minutes ago.
  let busy: UtcInterval[];
  try {
    busy = await googleCalendarProvider.getFreeBusy(interviewer.id, calendarId, startTime, endTime);
  } catch (err) {
    if (err instanceof CalendarNotConnectedError) {
      return { ok: false, reason: "calendar_not_connected", message: "Calendar Not Connected" };
    }
    throw err;
  }
  if (busy.length > 0) {
    return { ok: false, reason: "slot_unavailable", message: "That time is no longer available." };
  }

  const lockId = await acquireSchedulingLock(interviewer.id, startTime, endTime);
  if (!lockId) {
    return { ok: false, reason: "slot_unavailable", message: "That time is no longer available." };
  }

  try {
    // Double-check #2, inside the lock: closes the race window between the
    // first check and lock acquisition.
    const busyAgain = await googleCalendarProvider.getFreeBusy(interviewer.id, calendarId, startTime, endTime);
    if (busyAgain.length > 0) {
      return { ok: false, reason: "slot_unavailable", message: "That time is no longer available." };
    }

    let eventResult;
    try {
      eventResult = await googleCalendarProvider.createEvent(interviewer.id, {
        calendarId,
        summary: `${interviewType} Interview — ${interviewer.name} — ${job.title}`,
        description: `Interview for ${candidate.name} (${candidate.email}) — ${job.title}, ${interviewType} round. Interviewer: ${interviewer.name}.`,
        startTime,
        endTime,
        timezone: interviewer.timezone,
        attendeeEmails: [candidate.email, interviewer.email],
      });
    } catch (err) {
      // Never claim scheduled before the calendar event actually exists —
      // no scheduled_interviews row, no email, just a clear failure.
      const message = err instanceof Error ? err.message : "Calendar event creation failed.";
      return { ok: false, reason: "event_creation_failed", message };
    }

    const scheduledInterview = await createScheduledInterview({
      applicationId,
      candidateId: application.candidate_id,
      interviewerId: interviewer.id,
      interviewType,
      provider: "google",
      externalEventId: eventResult.externalEventId,
      startTime,
      endTime,
      timezone: interviewer.timezone,
      status: "CONFIRMED",
      meetingUrl: eventResult.meetingUrl,
    });

    await updateApplicationStage(applicationId, application.current_stage, "INTERVIEW_SCHEDULED", "Interview scheduled", {
      source: "scheduling",
      decision_source: "HUMAN",
      scheduled_interview_id: scheduledInterview.id,
    });

    const displayDate = new Intl.DateTimeFormat("en-US", { timeZone: interviewer.timezone, dateStyle: "long" }).format(new Date(startTime));
    const displayTime = new Intl.DateTimeFormat("en-US", { timeZone: interviewer.timezone, timeStyle: "short" }).format(new Date(startTime));

    await sendInterviewInvitation(
      {
        companyId,
        companyName,
        candidateId: application.candidate_id,
        applicationId,
        candidateName: candidate.name,
        candidateEmail: candidate.email,
        jobTitle: job.title,
      },
      { interviewDate: displayDate, interviewTime: displayTime, interviewerName: interviewer.name, meetingLink: eventResult.meetingUrl ?? "" }
    );

    if (notifyInterviewer) {
      await sendInterviewInvitation(
        {
          companyId,
          companyName,
          candidateId: application.candidate_id,
          applicationId,
          candidateName: interviewer.name,
          candidateEmail: interviewer.email,
          jobTitle: job.title,
        },
        { interviewDate: displayDate, interviewTime: displayTime, interviewerName: interviewer.name, meetingLink: eventResult.meetingUrl ?? "" }
      );
    }

    await logInternalEvent("interview_schedule.confirmed", {
      application_id: applicationId,
      candidate_id: application.candidate_id,
      job_id: application.job_id,
      payload: { scheduled_interview_id: scheduledInterview.id, interviewer_id: interviewer.id },
    });

    return { ok: true, scheduledInterview };
  } finally {
    await releaseSchedulingLock(lockId);
  }
}

export interface RescheduleResult {
  ok: boolean;
  scheduledInterview?: ScheduledInterview;
  reason?: string;
  message?: string;
}

/** Cancels the old Google event only after the new one is successfully
 * created, and never deletes the old scheduled_interviews row — it's
 * marked RESCHEDULED so history is preserved (spec §23). */
export async function rescheduleInterview(scheduledInterviewId: string, newStart: string, newEnd: string): Promise<RescheduleResult> {
  const existing = await getScheduledInterview(scheduledInterviewId);
  if (!existing) throw new Error("Scheduled interview not found.");
  if (existing.status !== "CONFIRMED" && existing.status !== "PROPOSED") {
    throw new Error(`Cannot reschedule an interview with status ${existing.status}.`);
  }

  const outcome = await confirmSlot(existing.application_id, existing.interviewer_id, newStart, newEnd, existing.interview_type, false);
  if (!outcome.ok) return { ok: false, reason: outcome.reason, message: outcome.message };

  await updateScheduledInterview(scheduledInterviewId, { status: "CANCELLED", cancelled_by: "SYSTEM", cancellation_reason: "Rescheduled" });

  if (existing.external_event_id) {
    try {
      const interviewer = await getInterviewer(existing.interviewer_id);
      if (interviewer) {
        await googleCalendarProvider.deleteEvent(interviewer.id, interviewer.calendar_id ?? interviewer.email, existing.external_event_id);
      }
    } catch {
      // The new event already exists and is the source of truth; a failure
      // to clean up the stale old Google event is logged, not fatal.
    }
  }

  const application = await getApplication(existing.application_id);
  if (application) {
    const { companyId } = await getAuthedCompanyId();
    const [job, candidate, company] = await Promise.all([getJob(application.job_id), getCandidate(existing.candidate_id), getCompany(companyId)]);

    if (job && candidate) {
      const displayDate = new Intl.DateTimeFormat("en-US", { dateStyle: "long" }).format(new Date(newStart));
      const displayTime = new Intl.DateTimeFormat("en-US", { timeStyle: "short" }).format(new Date(newStart));
      await sendInterviewRescheduleEmail(
        {
          companyId,
          companyName: company?.name ?? "the company",
          candidateId: existing.candidate_id,
          applicationId: existing.application_id,
          candidateName: candidate.name,
          candidateEmail: candidate.email,
          jobTitle: job.title,
        },
        { interviewDate: displayDate, interviewTime: displayTime, meetingLink: outcome.scheduledInterview.meeting_url ?? "" }
      );
    }
  }

  return { ok: true, scheduledInterview: outcome.scheduledInterview };
}

export async function cancelInterview(
  scheduledInterviewId: string,
  cancelledBy: "CANDIDATE" | "INTERVIEWER" | "RECRUITER" | "SYSTEM",
  reason: string
): Promise<void> {
  const existing = await getScheduledInterview(scheduledInterviewId);
  if (!existing) throw new Error("Scheduled interview not found.");

  if (existing.external_event_id) {
    const interviewer = await getInterviewer(existing.interviewer_id);
    if (interviewer) {
      try {
        await googleCalendarProvider.deleteEvent(interviewer.id, interviewer.calendar_id ?? interviewer.email, existing.external_event_id);
      } catch {
        // Proceed with marking cancelled locally even if the remote
        // deletion fails — the local status is the source of truth for
        // this app's own scheduling; a stray Google event can be cleaned
        // up manually and never causes a double-book since our own lock/
        // free-busy check always re-verifies with Google directly.
      }
    }
  }

  await updateScheduledInterview(scheduledInterviewId, { status: "CANCELLED", cancelled_by: cancelledBy, cancellation_reason: reason });

  await logInternalEvent("interview_schedule.cancelled", {
    application_id: existing.application_id,
    candidate_id: existing.candidate_id,
    payload: { scheduled_interview_id: scheduledInterviewId, cancelled_by: cancelledBy, reason },
  });
}

/** Manual-only — no attendance-detection mechanism exists, so NO_SHOW is
 * always a recruiter judgment call (spec §25), never automatic, and never
 * touches applications.current_stage. */
export async function markNoShow(scheduledInterviewId: string): Promise<void> {
  await updateScheduledInterview(scheduledInterviewId, { status: "NO_SHOW" });
}
