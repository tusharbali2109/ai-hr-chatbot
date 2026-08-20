import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, MapPin, Briefcase, Users } from "lucide-react";
import { createWebhookClient } from "@/lib/supabase/webhook-client";
import { Badge } from "@/components/ui/Badge";
import { ApplyForm } from "./ApplyForm";

export default async function CareersJobPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const supabase = createWebhookClient();

  const { data: job } = await supabase
    .from("jobs")
    .select(
      "id, title, description, responsibilities, required_skills, preferred_skills, location, employment_type, work_mode, experience_min, experience_max, number_of_openings, status, jd_status, companies(name)"
    )
    .eq("id", jobId)
    .maybeSingle();

  if (!job || job.status !== "open" || job.jd_status !== "APPROVED") notFound();

  const company = Array.isArray(job.companies) ? job.companies[0] : job.companies;

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <Link href="/careers" className="mb-6 flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
        <ArrowLeft className="h-4 w-4" />
        All open roles
      </Link>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_360px] lg:items-start">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">{job.title}</h1>
          {company?.name && <p className="mt-1.5 text-sm text-muted-foreground">{company.name}</p>}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Badge tone="neutral">
              <MapPin className="h-3 w-3" />
              {job.location}
              {job.work_mode ? ` · ${job.work_mode}` : ""}
            </Badge>
            <Badge tone="neutral">
              <Briefcase className="h-3 w-3" />
              {job.employment_type.replace("_", "-")}
            </Badge>
            <Badge tone="neutral">
              <Users className="h-3 w-3" />
              {job.experience_min}–{job.experience_max} yrs
            </Badge>
          </div>

          <div className="mt-8 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">{job.description}</div>

          {job.responsibilities?.length > 0 && (
            <div className="mt-8">
              <h2 className="mb-3 text-sm font-semibold text-foreground">Responsibilities</h2>
              <ul className="flex flex-col gap-2">
                {job.responsibilities.map((r: string) => (
                  <li key={r} className="flex gap-2.5 text-sm text-muted-foreground">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-muted-foreground" />
                    {r}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {(job.required_skills?.length > 0 || job.preferred_skills?.length > 0) && (
            <div className="mt-8">
              <h2 className="mb-3 text-sm font-semibold text-foreground">What we&apos;re looking for</h2>
              <div className="flex flex-wrap gap-1.5">
                {job.required_skills?.map((s: string) => (
                  <Badge key={s} tone="accent">
                    {s}
                  </Badge>
                ))}
                {job.preferred_skills?.map((s: string) => (
                  <Badge key={s} tone="info">
                    {s}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="lg:sticky lg:top-24">
          <div className="rounded-[var(--radius-lg)] border border-border bg-surface p-6 shadow-[var(--shadow-elevated)]">
            <h2 className="mb-4 text-base font-semibold text-foreground">Apply for this role</h2>
            <ApplyForm jobId={job.id} />
          </div>
        </div>
      </div>
    </div>
  );
}
