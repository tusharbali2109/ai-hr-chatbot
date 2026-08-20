import Link from "next/link";
import { MapPin, Briefcase, ArrowRight } from "lucide-react";
import { createWebhookClient } from "@/lib/supabase/webhook-client";
import { EmptyState } from "@/components/ui/EmptyState";

export const metadata = { title: "Careers" };
// Must render per-request, not at build time — a static build would bake in
// whatever jobs were open the moment `npm run build` ran (and, on Vercel,
// fail the build entirely if service-role env vars aren't present yet,
// since build-time execution has no request context to defer to).
export const dynamic = "force-dynamic";

interface PublicJobRow {
  id: string;
  title: string;
  location: string;
  employment_type: string;
  work_mode: string | null;
  companies: { name: string } | { name: string }[] | null;
}

function companyName(row: PublicJobRow): string {
  const company = Array.isArray(row.companies) ? row.companies[0] : row.companies;
  return company?.name ?? "";
}

export default async function CareersPage() {
  const supabase = createWebhookClient();

  const { data, error } = await supabase
    .from("jobs")
    .select("id, title, location, employment_type, work_mode, companies(name)")
    .eq("status", "open")
    .eq("jd_status", "APPROVED")
    .order("created_at", { ascending: false });

  const jobs = (error ? [] : (data as unknown as PublicJobRow[])) ?? [];

  return (
    <div className="mx-auto max-w-4xl px-6">
      <div className="border-b border-border py-16 text-center">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">Open Roles</h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
          Find your next role and apply directly — no account or sign-up required.
        </p>
      </div>

      <div className="py-10">
        {jobs.length === 0 ? (
          <EmptyState title="No open roles right now" description="Check back soon — new positions are posted here as they open." />
        ) : (
          <>
            <p className="mb-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {jobs.length} open role{jobs.length === 1 ? "" : "s"}
            </p>
            <div className="flex flex-col gap-3">
              {jobs.map((job) => (
                <Link
                  key={job.id}
                  href={`/careers/${job.id}`}
                  className="group flex items-center justify-between gap-4 rounded-[var(--radius-lg)] border border-border bg-surface p-5 shadow-[var(--shadow-soft)] transition-[border-color,transform] duration-[var(--duration-fast)] ease-[var(--ease-out)] hover:border-[color-mix(in_srgb,var(--accent)_35%,var(--border))] hover:-translate-y-0.5"
                >
                  <div className="min-w-0">
                    <h2 className="truncate text-base font-semibold text-foreground">{job.title}</h2>
                    {companyName(job) && <p className="mt-0.5 text-xs text-muted-foreground">{companyName(job)}</p>}
                    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1.5">
                        <MapPin className="h-3.5 w-3.5" />
                        {job.location}
                        {job.work_mode ? ` · ${job.work_mode}` : ""}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <Briefcase className="h-3.5 w-3.5" />
                        {job.employment_type.replace("_", "-")}
                      </span>
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-[var(--duration-fast)] group-hover:translate-x-0.5 group-hover:text-accent" />
                </Link>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
