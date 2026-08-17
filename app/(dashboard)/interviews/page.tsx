import Link from "next/link";
import { MessagesSquare, CalendarPlus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";

const STATUS_TONE: Record<string, "neutral" | "info" | "success" | "warning" | "danger"> = {
  PROPOSED: "info",
  CONFIRMED: "success",
  CANCELLED: "danger",
  COMPLETED: "neutral",
  NO_SHOW: "warning",
  RESCHEDULED: "neutral",
};

export default async function InterviewsPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("scheduled_interviews")
    .select("*, candidate:candidates(id,name,email), interviewer:interviewers(name,email), application:applications(job:jobs(title))")
    .order("start_time", { ascending: false })
    .limit(200);
  if (error) throw error;

  const rows = (data ?? []).map((row) => ({
    ...row,
    candidate: row.candidate as unknown as { id: string; name: string; email: string } | null,
    interviewer: row.interviewer as unknown as { name: string; email: string } | null,
    jobTitle: (row.application as unknown as { job: { title: string } | null } | null)?.job?.title ?? "Unknown job",
  }));
  // This is an async server component; capture the request-time boundary once.
  // eslint-disable-next-line react-hooks/purity
  const requestTime = Date.now();
  const upcoming = rows.filter((row) => row.status === "CONFIRMED" && new Date(row.start_time as string).getTime() > requestTime).length;
  const completed = rows.filter((row) => row.status === "COMPLETED").length;

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Interviews</h1>
          <p className="mt-1 text-sm text-muted-foreground">Manage every recruiter-led interview and open its candidate workflow.</p>
        </div>
        <div className="flex gap-2"><Badge tone="success">Upcoming: {upcoming}</Badge><Badge tone="neutral">Completed: {completed}</Badge></div>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={MessagesSquare}
          title="No interviews scheduled yet"
          description="Open an assessment-shortlisted candidate and use the scheduling panel to save availability and confirm a slot."
          action={<Link href="/candidates" className="inline-flex h-9 items-center gap-2 rounded-[var(--radius-md)] bg-accent px-4 text-sm font-medium text-accent-foreground"><CalendarPlus className="h-4 w-4" />Choose candidate</Link>}
        />
      ) : (
        <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-border bg-surface">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="border-b border-border bg-surface-elevated text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-4 py-3">Candidate</th><th className="px-4 py-3">Job</th><th className="px-4 py-3">Interviewer</th><th className="px-4 py-3">Type</th><th className="px-4 py-3">When</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Action</th></tr></thead>
            <tbody>{rows.map((row) => <tr key={row.id as string} className="border-b border-border-subtle last:border-0">
              <td className="px-4 py-3"><span className="font-medium text-foreground">{row.candidate?.name ?? "Candidate"}</span><span className="block text-xs text-muted-foreground">{row.candidate?.email}</span></td>
              <td className="px-4 py-3 text-foreground">{row.jobTitle}</td>
              <td className="px-4 py-3"><span className="text-foreground">{row.interviewer?.name ?? "Unassigned"}</span><span className="block text-xs text-muted-foreground">{row.interviewer?.email}</span></td>
              <td className="px-4 py-3 text-foreground">{row.interview_type as string}</td>
              <td className="px-4 py-3 text-foreground">{new Intl.DateTimeFormat("en-IN", { timeZone: row.timezone as string, dateStyle: "medium", timeStyle: "short" }).format(new Date(row.start_time as string))}</td>
              <td className="px-4 py-3"><Badge tone={STATUS_TONE[row.status as string] ?? "neutral"}>{String(row.status).replace(/_/g, " ")}</Badge></td>
              <td className="px-4 py-3">{row.meeting_url ? <a href={row.meeting_url as string} target="_blank" rel="noreferrer" className="text-accent hover:underline">Join</a> : row.candidate?.id ? <Link href={`/candidates/${row.candidate.id}`} className="text-accent hover:underline">Manage</Link> : "—"}</td>
            </tr>)}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}
