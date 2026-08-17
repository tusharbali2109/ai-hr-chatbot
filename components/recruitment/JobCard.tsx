import Link from "next/link";
import { MapPin, Briefcase, Users, CheckCircle2 } from "lucide-react";
import type { Job } from "@/lib/types/database";
import { Badge } from "@/components/ui/Badge";

const STATUS_TONE: Record<Job["status"], "success" | "warning" | "neutral" | "danger"> = {
  open: "success",
  paused: "warning",
  draft: "neutral",
  closed: "danger",
};

const EMPLOYMENT_LABEL: Record<Job["employment_type"], string> = {
  full_time: "Full-time",
  part_time: "Part-time",
  contract: "Contract",
  internship: "Internship",
};

export interface JobCardProps {
  job: Job;
  applicationCount: number;
  shortlistedCount: number;
}

export function JobCard({ job, applicationCount, shortlistedCount }: JobCardProps) {
  return (
    <Link
      href={`/jobs/${job.id}`}
      className="group flex flex-col gap-4 rounded-[var(--radius-lg)] border border-border bg-surface p-5 transition-[border-color,transform,box-shadow] duration-[var(--duration-fast)] ease-[var(--ease-out)] hover:-translate-y-0.5 hover:border-[color-mix(in_srgb,var(--accent)_35%,var(--border))] hover:shadow-[var(--shadow-soft)]"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-foreground group-hover:text-accent">{job.title}</h3>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
            <MapPin className="h-3.5 w-3.5" />
            {job.location}
          </p>
        </div>
        <Badge tone={STATUS_TONE[job.status]} className="capitalize">
          {job.status}
        </Badge>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Briefcase className="h-3.5 w-3.5" />
          {EMPLOYMENT_LABEL[job.employment_type]}
        </span>
        <span>
          {job.experience_min}–{job.experience_max} yrs exp
        </span>
      </div>

      <div className="mt-1 flex items-center gap-4 border-t border-border-subtle pt-3 text-sm">
        <span className="flex items-center gap-1.5 text-foreground">
          <Users className="h-3.5 w-3.5 text-muted-foreground" />
          {applicationCount} applied
        </span>
        <span className="flex items-center gap-1.5 text-foreground">
          <CheckCircle2 className="h-3.5 w-3.5 text-muted-foreground" />
          {shortlistedCount} shortlisted
        </span>
      </div>
    </Link>
  );
}
