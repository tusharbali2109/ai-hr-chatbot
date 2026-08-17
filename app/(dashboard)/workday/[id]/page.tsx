import { notFound } from "next/navigation";
import { getSimulation, listTasks } from "@/lib/services/workday";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/Badge";
import { AssignButton } from "./AssignButton";

export default async function WorkdayDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const simulation = await getSimulation(id);
  if (!simulation) notFound();
  const supabase = await createClient();
  const [tasks, { data: applications }, { data: assignments }] = await Promise.all([
    listTasks(id),
    supabase.from("applications").select("id,candidate_id,current_stage,candidate:candidates(name,email)").eq("job_id", simulation.job_id).limit(100),
    supabase.from("workday_assignments").select("application_id").eq("simulation_id", id),
  ]);
  const assigned = new Set((assignments ?? []).map((item) => item.application_id));
  return <div className="mx-auto max-w-6xl px-6 py-8">
    <h1 className="text-2xl font-semibold text-foreground">{simulation.title}</h1><p className="mt-1 text-sm text-muted-foreground">{simulation.description}</p>
    <h2 className="mb-3 mt-8 font-semibold text-foreground">Simulation tasks</h2>
    <div className="grid gap-3">{tasks.map((task) => <div key={task.id} className="rounded-lg border border-border bg-surface p-4"><div className="flex justify-between"><span className="font-medium text-foreground">{task.sequence}. {task.title}</span><Badge tone="info">{task.time_budget_minutes} min</Badge></div><p className="mt-2 text-sm text-muted-foreground">{task.scenario}</p><p className="mt-2 text-xs text-accent">Deliverable: {task.deliverable}</p></div>)}</div>
    <h2 className="mb-3 mt-8 font-semibold text-foreground">Assign candidates</h2>
    <div className="divide-y divide-border rounded-lg border border-border bg-surface">{(applications ?? []).map((application) => { const candidate = application.candidate as unknown as { name: string; email: string } | null; return <div key={application.id} className="flex items-center justify-between gap-3 p-4"><div><p className="text-sm font-medium text-foreground">{candidate?.name}</p><p className="text-xs text-muted-foreground">{candidate?.email} · {application.current_stage}</p></div>{assigned.has(application.id) ? <Badge tone="success">Assigned</Badge> : <AssignButton simulationId={id} applicationId={application.id} candidateId={application.candidate_id} />}</div>; })}</div>
  </div>;
}
