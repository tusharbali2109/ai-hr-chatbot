"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Link2, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { createInterviewerAction, deactivateInterviewerAction, reactivateInterviewerAction, startCalendarConnectAction } from "@/lib/actions/interviewers";
import type { Interviewer, CalendarConnectionSummary, WorkingHoursBlock } from "@/lib/types/database";

const DEFAULT_WORKING_HOURS: WorkingHoursBlock[] = [
  { day_of_week: 1, start: "10:00", end: "18:00" },
  { day_of_week: 2, start: "10:00", end: "18:00" },
  { day_of_week: 3, start: "10:00", end: "18:00" },
  { day_of_week: 4, start: "10:00", end: "18:00" },
  { day_of_week: 5, start: "10:00", end: "18:00" },
];

const CONNECTION_TONE: Record<string, "success" | "danger" | "neutral"> = {
  connected: "success",
  error: "danger",
  not_connected: "neutral",
};

const CONNECTION_ICON = { connected: CheckCircle2, error: XCircle, not_connected: AlertTriangle } as const;
const CONNECTION_LABEL: Record<string, string> = { connected: "Connected", error: "Connection Error", not_connected: "Not Connected" };

export function InterviewersPanel({ interviewers, connections }: { interviewers: Interviewer[]; connections: CalendarConnectionSummary[] }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [addOpen, setAddOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [timezone, setTimezone] = useState("Asia/Kolkata");
  const [types, setTypes] = useState("");
  const [saving, setSaving] = useState(false);
  const [connectingId, setConnectingId] = useState<string | null>(null);

  const connectionByInterviewer = new Map(connections.map((c) => [c.interviewer_id, c]));

  async function handleCreate() {
    setSaving(true);
    try {
      await createInterviewerAction({
        name,
        email,
        timezone,
        interviewTypes: types
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        workingHours: DEFAULT_WORKING_HOURS,
      });
      showToast("Interviewer added.", "success");
      setAddOpen(false);
      setName("");
      setEmail("");
      setTypes("");
      router.refresh();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to add interviewer.", "danger");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive(interviewer: Interviewer) {
    try {
      if (interviewer.active) await deactivateInterviewerAction(interviewer.id);
      else await reactivateInterviewerAction(interviewer.id);
      router.refresh();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to update interviewer.", "danger");
    }
  }

  async function handleConnect(interviewerId: string) {
    setConnectingId(interviewerId);
    try {
      const { url } = await startCalendarConnectAction(interviewerId);
      window.location.assign(url);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to start calendar connection.", "danger");
      setConnectingId(null);
    }
  }

  return (
    <div className="rounded-[var(--radius-lg)] border border-border bg-surface p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Interviewers</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">Each interviewer connects their own Google Calendar.</p>
        </div>
        <Button size="sm" variant="secondary" onClick={() => setAddOpen(true)}>
          <Plus className="h-3.5 w-3.5" />
          Add Interviewer
        </Button>
      </div>

      {interviewers.length === 0 ? (
        <p className="text-sm text-muted-foreground">No interviewers configured yet.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {interviewers.map((interviewer) => {
            const connection = connectionByInterviewer.get(interviewer.id);
            const status = connection?.status ?? "not_connected";
            const Icon = CONNECTION_ICON[status];
            return (
              <div key={interviewer.id} className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-md)] border border-border-subtle p-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground">{interviewer.name}</span>
                    {!interviewer.active && <Badge tone="neutral">Inactive</Badge>}
                    <Badge tone={CONNECTION_TONE[status]}>
                      <Icon className="h-3 w-3" />
                      {CONNECTION_LABEL[status]}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {interviewer.email} · {interviewer.timezone} · {interviewer.interview_types.join(", ") || "No interview types set"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {status !== "connected" && (
                    <Button size="sm" variant="secondary" onClick={() => handleConnect(interviewer.id)} disabled={connectingId === interviewer.id}>
                      <Link2 className="h-3.5 w-3.5" />
                      Connect Google Calendar
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => handleToggleActive(interviewer)}>
                    {interviewer.active ? "Deactivate" : "Reactivate"}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add Interviewer">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">Name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">Email</label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">Timezone (IANA)</label>
            <Input value={timezone} onChange={(e) => setTimezone(e.target.value)} placeholder="Asia/Kolkata" />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">Interview types (comma-separated)</label>
            <Input value={types} onChange={(e) => setTypes(e.target.value)} placeholder="Technical, Backend, Final" />
          </div>
          <div className="mt-2 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={saving || !name.trim() || !email.trim()}>
              {saving ? "Saving…" : "Add"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
