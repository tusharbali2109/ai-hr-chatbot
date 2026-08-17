import Link from "next/link";
import { BriefcaseBusiness } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { listSimulations } from "@/lib/services/workday";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { CreateWorkdayButton } from "./CreateWorkdayButton";

type SimulationListItem = {
  id: string;
  title: string;
  status: string;
  duration_minutes: number;
  job: { title: string } | null;
};

export default async function WorkdayPage() {
  const supabase = await createClient();
  const schemaCheck = await supabase.from("workday_simulations").select("id", { head: true, count: "exact" });
  const schemaMissing = schemaCheck.error?.code === "PGRST205";
  const [simulations, { data: jobs }] = await Promise.all([
    listSimulations(),
    supabase.from("jobs").select("id,title").eq("jd_status", "APPROVED").order("title"),
  ]);

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-6 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Candidate Digital Workday</h1>
          <p className="mt-1 text-sm text-muted-foreground">Evaluate real decisions, prioritization, recovery and AI-use transparency.</p>
        </div>
        {!schemaMissing && <CreateWorkdayButton jobs={(jobs ?? []) as { id: string; title: string }[]} />}
      </div>
      {schemaMissing ? (
        <div className="rounded-xl border border-warning/30 bg-warning/10 p-5">
          <h2 className="font-semibold text-foreground">Phase 9 database setup required</h2>
          <p className="mt-2 text-sm text-muted-foreground">Run <code className="text-foreground">supabase/migrations/20260817054208_phase9_digital_workday.sql</code> in Supabase SQL Editor, then reload this page.</p>
        </div>
      ) : !simulations.length ? (
        <EmptyState icon={BriefcaseBusiness} title="No work simulations yet" description="Create one from an approved job description." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {(simulations as SimulationListItem[]).map((simulation) => (
            <Link key={simulation.id} href={`/workday/${simulation.id}`} className="rounded-[var(--radius-lg)] border border-border bg-surface p-5 hover:border-accent/40">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-foreground">{simulation.title}</h2>
                <Badge tone={simulation.status === "READY" ? "success" : "neutral"}>{simulation.status}</Badge>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{simulation.job?.title} · {simulation.duration_minutes} minutes</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
