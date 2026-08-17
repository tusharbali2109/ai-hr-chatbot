"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Plus, Search } from "lucide-react";
import type { Job } from "@/lib/types/database";
import { JobCard } from "@/components/recruitment/JobCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { cn } from "@/lib/utils/cn";

export interface JobBoardItem {
  job: Job;
  applicationCount: number;
  shortlistedCount: number;
}

type SortKey = "newest" | "oldest" | "most-applications" | "title";

export function JobsBoard({ items }: { items: JobBoardItem[] }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [sort, setSort] = useState<SortKey>("newest");

  const filtered = useMemo(() => {
    let result = items.filter(({ job }) => {
      const matchesQuery =
        query.trim() === "" ||
        job.title.toLowerCase().includes(query.toLowerCase()) ||
        job.location.toLowerCase().includes(query.toLowerCase());
      const matchesStatus = status === "all" || job.status === status;
      return matchesQuery && matchesStatus;
    });

    result = [...result].sort((a, b) => {
      switch (sort) {
        case "oldest":
          return new Date(a.job.created_at).getTime() - new Date(b.job.created_at).getTime();
        case "most-applications":
          return b.applicationCount - a.applicationCount;
        case "title":
          return a.job.title.localeCompare(b.job.title);
        default:
          return new Date(b.job.created_at).getTime() - new Date(a.job.created_at).getTime();
      }
    });

    return result;
  }, [items, query, status, sort]);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search jobs by title or location…"
            className="pl-9"
          />
        </div>
        <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-40">
          <option value="all">All statuses</option>
          <option value="open">Open</option>
          <option value="paused">Paused</option>
          <option value="draft">Draft</option>
          <option value="closed">Closed</option>
        </Select>
        <Select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className="w-48">
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="most-applications">Most applications</option>
          <option value="title">Title (A–Z)</option>
        </Select>
        <Link
          href="/jobs/new"
          className={cn(
            "inline-flex h-10 items-center justify-center gap-2 rounded-[var(--radius-md)] bg-accent px-4 text-sm font-medium text-accent-foreground transition-[background-color,transform] duration-[var(--duration-fast)] ease-[var(--ease-out)] hover:bg-accent-hover active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          )}
        >
          <Plus className="h-4 w-4" />
          Create Job
        </Link>
      </div>

      {filtered.length === 0 ? (
        <EmptyState title="No jobs match your filters" description="Try adjusting your search or create a new role." />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map(({ job, applicationCount, shortlistedCount }) => (
            <JobCard key={job.id} job={job} applicationCount={applicationCount} shortlistedCount={shortlistedCount} />
          ))}
        </div>
      )}
    </div>
  );
}
