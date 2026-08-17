"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import {
  saveCandidateAvailabilityAction,
  autoSelectInterviewerAction,
  proposeInterviewSlotsAction,
  confirmInterviewSlotAction,
  rescheduleInterviewAction,
  cancelInterviewAction,
  markNoShowAction,
} from "@/lib/actions/scheduling";
import type { Interviewer, ScheduledInterview, CandidateAvailability } from "@/lib/types/database";
import type { ProposedSlot } from "@/lib/scheduling/agent";

const DAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const STATUS_TONE: Record<string, "neutral" | "info" | "success" | "warning" | "danger"> = {
  PROPOSED: "info",
  CONFIRMED: "success",
  CANCELLED: "danger",
  COMPLETED: "neutral",
  NO_SHOW: "warning",
  RESCHEDULED: "neutral",
};

interface AvailabilityRow {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  timezone: string;
}

export function InterviewSchedulingActions({
  applicationId,
  currentStage,
  interviewers,
  currentInterview,
  initialAvailability,
}: {
  applicationId: string;
  currentStage: string;
  interviewers: Interviewer[];
  currentInterview: ScheduledInterview | null;
  initialAvailability: CandidateAvailability[];
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [availability, setAvailability] = useState<AvailabilityRow[]>(
    initialAvailability.length > 0
      ? initialAvailability.map((a) => ({ dayOfWeek: a.day_of_week, startTime: a.start_time.slice(0, 5), endTime: a.end_time.slice(0, 5), timezone: a.timezone }))
      : [{ dayOfWeek: 1, startTime: "10:00", endTime: "16:00", timezone: "Asia/Kolkata" }]
  );
  const [savingAvailability, setSavingAvailability] = useState(false);
  const [interviewType, setInterviewType] = useState(interviewers[0]?.interview_types[0] ?? "Technical");
  const [interviewerId, setInterviewerId] = useState<string>("auto");
  const [slots, setSlots] = useState<ProposedSlot[]>([]);
  const [proposing, setProposing] = useState(false);
  const [calendarNotConnected, setCalendarNotConnected] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [rescheduling, setRescheduling] = useState(false);

  const eligible = ["ASSESSMENT_SHORTLISTED", "FINAL_REVIEW"].includes(currentStage);

  function updateRow(index: number, patch: Partial<AvailabilityRow>) {
    setAvailability((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  async function handleSaveAvailability() {
    setSavingAvailability(true);
    try {
      await saveCandidateAvailabilityAction(
        applicationId,
        availability.map((a) => ({ dayOfWeek: a.dayOfWeek, startTime: `${a.startTime}:00`, endTime: `${a.endTime}:00`, timezone: a.timezone }))
      );
      showToast("Candidate availability saved.", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to save availability.", "danger");
    } finally {
      setSavingAvailability(false);
    }
  }

  async function handlePropose() {
    setProposing(true);
    setCalendarNotConnected(false);
    setSlots([]);
    try {
      let targetInterviewerId = interviewerId;
      if (targetInterviewerId === "auto") {
        const selected = await autoSelectInterviewerAction(applicationId, interviewType);
        targetInterviewerId = selected.id;
        setInterviewerId(selected.id);
      }
      const result = await proposeInterviewSlotsAction(applicationId, targetInterviewerId);
      if (!result.calendarConnected) {
        setCalendarNotConnected(true);
        return;
      }
      if (result.slots.length === 0) {
        showToast(result.error ?? "No overlapping availability found.", "info");
      }
      setSlots(result.slots);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to propose slots.", "danger");
    } finally {
      setProposing(false);
    }
  }

  async function handleConfirm(slot: ProposedSlot) {
    setConfirming(slot.start);
    try {
      if (rescheduling && currentInterview) {
        const result = await rescheduleInterviewAction(applicationId, currentInterview.id, slot.start, slot.end);
        if (!result.ok) {
          showToast(result.message ?? "That time is no longer available.", "danger");
          if (result.reason === "slot_unavailable") await handlePropose();
          return;
        }
        showToast("Interview rescheduled and candidate notified.", "success");
        setRescheduling(false);
        router.refresh();
        return;
      }

      const outcome = await confirmInterviewSlotAction(applicationId, interviewerId, slot.start, slot.end, interviewType, true);
      if (!outcome.ok) {
        showToast(outcome.message, "danger");
        if (outcome.reason === "slot_unavailable") await handlePropose();
        return;
      }
      showToast("Interview confirmed and calendar invitations sent.", "success");
      router.refresh();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to confirm slot.", "danger");
    } finally {
      setConfirming(null);
    }
  }

  async function handleCancel() {
    if (!currentInterview) return;
    try {
      await cancelInterviewAction(applicationId, currentInterview.id, "RECRUITER", cancelReason);
      showToast("Interview cancelled.", "success");
      setCancelOpen(false);
      setCancelReason("");
      router.refresh();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to cancel interview.", "danger");
    }
  }

  async function handleNoShow() {
    if (!currentInterview) return;
    try {
      await markNoShowAction(applicationId, currentInterview.id);
      showToast("Marked as no-show.", "success");
      router.refresh();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to update.", "danger");
    }
  }

  if (currentInterview && ["CONFIRMED", "COMPLETED", "NO_SHOW"].includes(currentInterview.status) && !rescheduling) {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={STATUS_TONE[currentInterview.status]}>{currentInterview.status.replace(/_/g, " ")}</Badge>
          <span className="text-sm text-foreground">
            {new Intl.DateTimeFormat("en-US", { timeZone: currentInterview.timezone, dateStyle: "medium", timeStyle: "short" }).format(
              new Date(currentInterview.start_time)
            )}
          </span>
          {currentInterview.meeting_url && (
            <a href={currentInterview.meeting_url} target="_blank" rel="noreferrer" className="text-sm text-accent hover:underline">
              Meeting link
            </a>
          )}
        </div>
        {currentInterview.status === "CONFIRMED" && (
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setInterviewerId(currentInterview.interviewer_id);
                setInterviewType(currentInterview.interview_type);
                setRescheduling(true);
              }}
            >
              Reschedule
            </Button>
            <Button size="sm" variant="secondary" onClick={handleNoShow}>
              Mark No-Show
            </Button>
            <Button size="sm" variant="danger" onClick={() => setCancelOpen(true)}>
              Cancel Interview
            </Button>
          </div>
        )}
        <Modal open={cancelOpen} onClose={() => setCancelOpen(false)} title="Cancel Interview">
          <textarea
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            rows={3}
            placeholder="Reason for cancellation"
            className="w-full rounded-[var(--radius-md)] border border-border bg-surface px-3 py-2 text-sm text-foreground"
          />
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setCancelOpen(false)}>
              Back
            </Button>
            <Button variant="danger" onClick={handleCancel} disabled={!cancelReason.trim()}>
              Confirm Cancellation
            </Button>
          </div>
        </Modal>
      </div>
    );
  }

  if (!eligible && !rescheduling) {
    return <p className="text-xs text-muted-foreground">Only candidates who were shortlisted after assessment are eligible for interview scheduling.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      {rescheduling && (
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-foreground">Rescheduling interview</p>
          <Button size="sm" variant="ghost" onClick={() => setRescheduling(false)}>
            Cancel
          </Button>
        </div>
      )}
      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Candidate Availability</p>
        <div className="flex flex-col gap-2">
          {availability.map((row, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <Select value={row.dayOfWeek} onChange={(e) => updateRow(i, { dayOfWeek: Number(e.target.value) })} className="w-36">
                {DAY_LABELS.map((label, d) => (
                  <option key={d} value={d}>
                    {label}
                  </option>
                ))}
              </Select>
              <Input type="time" value={row.startTime} onChange={(e) => updateRow(i, { startTime: e.target.value })} className="w-28" />
              <span className="text-xs text-muted-foreground">to</span>
              <Input type="time" value={row.endTime} onChange={(e) => updateRow(i, { endTime: e.target.value })} className="w-28" />
              <Input value={row.timezone} onChange={(e) => updateRow(i, { timezone: e.target.value })} className="w-36" placeholder="Asia/Kolkata" />
              <Button size="sm" variant="ghost" onClick={() => setAvailability((prev) => prev.filter((_, idx) => idx !== i))}>
                <Trash2 className="h-3.5 w-3.5 text-danger" />
              </Button>
            </div>
          ))}
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setAvailability((prev) => [...prev, { dayOfWeek: 1, startTime: "10:00", endTime: "16:00", timezone: "Asia/Kolkata" }])}
            >
              <Plus className="h-3.5 w-3.5" />
              Add block
            </Button>
            <Button size="sm" variant="secondary" onClick={handleSaveAvailability} disabled={savingAvailability}>
              {savingAvailability ? "Saving…" : "Save availability"}
            </Button>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-muted-foreground">Interview type</label>
          <Input value={interviewType} onChange={(e) => setInterviewType(e.target.value)} className="w-40" />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-muted-foreground">Interviewer</label>
          <Select value={interviewerId} onChange={(e) => setInterviewerId(e.target.value)} className="w-48">
            <option value="auto">Auto-select</option>
            {interviewers.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </Select>
        </div>
        <Button size="sm" onClick={handlePropose} disabled={proposing}>
          <CalendarClock className="h-3.5 w-3.5" />
          {proposing ? "Finding slots…" : "Propose Slots"}
        </Button>
      </div>

      {calendarNotConnected && <p className="text-sm text-warning">Calendar Not Connected — this interviewer needs to connect Google Calendar in Settings first.</p>}

      {slots.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {slots.map((slot) => (
            <Button key={slot.start} size="sm" variant="secondary" onClick={() => handleConfirm(slot)} disabled={confirming === slot.start}>
              {new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(slot.start))}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
