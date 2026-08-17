import Link from "next/link";
import { CalendarDays, Settings } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";

export default async function CalendarPage() {
  const supabase = await createClient();
  const now = new Date();
  const horizon = new Date(now);
  horizon.setDate(horizon.getDate() + 60);
  const [{ data: interviews, error }, { data: connections }] = await Promise.all([
    supabase.from("scheduled_interviews").select("*, candidate:candidates(id,name), interviewer:interviewers(name), application:applications(job:jobs(title))").eq("status", "CONFIRMED").gte("start_time", now.toISOString()).lte("start_time", horizon.toISOString()).order("start_time"),
    supabase.from("calendar_connections").select("status"),
  ]);
  if (error) throw error;
  const connected = (connections ?? []).filter((item) => item.status === "connected").length;
  const grouped = new Map<string, typeof interviews>();
  for (const item of interviews ?? []) {
    const key = new Date(item.start_time as string).toLocaleDateString("en-CA");
    grouped.set(key, [...(grouped.get(key) ?? []), item]);
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-2xl font-semibold tracking-tight text-foreground">Interview Calendar</h1><p className="mt-1 text-sm text-muted-foreground">Confirmed interviews for the next 60 days.</p></div><Link href="/settings" className="inline-flex h-9 items-center gap-2 rounded-[var(--radius-md)] border border-border bg-surface-elevated px-3 text-sm text-foreground"><Settings className="h-4 w-4" />Calendar settings <Badge tone={connected ? "success" : "warning"}>{connected} connected</Badge></Link></div>
      {!interviews?.length ? <EmptyState icon={CalendarDays} title="No confirmed interviews in the next 60 days" description="Configure interviewers in Settings, then schedule from an eligible candidate's detail page." action={<Link href="/candidates" className="text-sm font-medium text-accent hover:underline">Open candidates</Link>} /> :
        <div className="flex flex-col gap-5">{Array.from(grouped.entries()).map(([day, items]) => <section key={day}><h2 className="mb-2 text-sm font-semibold text-foreground">{new Intl.DateTimeFormat("en-IN", { dateStyle: "full" }).format(new Date(`${day}T12:00:00`))}</h2><div className="flex flex-col gap-2">{items?.map((item) => {
          const candidate = item.candidate as unknown as { id: string; name: string } | null;
          const interviewer = item.interviewer as unknown as { name: string } | null;
          const job = (item.application as unknown as { job: { title: string } | null } | null)?.job;
          return <div key={item.id as string} className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-lg)] border border-border bg-surface p-4"><div className="flex items-center gap-4"><div className="min-w-24 text-sm font-semibold text-accent">{new Intl.DateTimeFormat("en-IN", { timeZone: item.timezone as string, hour: "2-digit", minute: "2-digit" }).format(new Date(item.start_time as string))}</div><div><Link href={candidate ? `/candidates/${candidate.id}` : "/candidates"} className="font-medium text-foreground hover:text-accent">{candidate?.name ?? "Candidate"}</Link><p className="text-xs text-muted-foreground">{job?.title ?? "Interview"} · {item.interview_type as string} · {interviewer?.name ?? "Unassigned"}</p></div></div>{item.meeting_url ? <a href={item.meeting_url as string} target="_blank" rel="noreferrer" className="text-sm font-medium text-accent hover:underline">Join meeting</a> : <Badge tone="warning">Meeting link pending</Badge>}</div>;
        })}</div></section>)}</div>}
    </div>
  );
}
