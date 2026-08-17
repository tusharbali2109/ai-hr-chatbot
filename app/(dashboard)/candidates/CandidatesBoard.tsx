"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { EmptyState } from "@/components/ui/EmptyState";
import { CandidateTable, type CandidateRow } from "@/components/recruitment/CandidateTable";
import { RECRUITMENT_STAGES, STAGE_META, type RecruitmentStage } from "@/lib/stages";

export interface CandidateListItem {
  applicationId: string;
  candidateId: string;
  name: string;
  email: string;
  location: string | null;
  jobTitle: string;
  stage: RecruitmentStage;
  score: number | null;
  appliedAt: string;
  source: string;
  sourcePlatform?: string | null;
  recommendation?: "SHORTLISTED" | "REJECTED" | "NEEDS_REVIEW" | null;
}

type SortKey = "newest" | "oldest" | "score-desc" | "name";

export function CandidatesBoard({ items }: { items: CandidateListItem[] }) {
  const [query, setQuery] = useState("");
  const [stage, setStage] = useState<string>("all");
  const [sort, setSort] = useState<SortKey>("newest");

  const filtered = useMemo(() => {
    let result = items.filter((item) => {
      const matchesQuery =
        query.trim() === "" ||
        item.name.toLowerCase().includes(query.toLowerCase()) ||
        item.email.toLowerCase().includes(query.toLowerCase()) ||
        item.jobTitle.toLowerCase().includes(query.toLowerCase());
      const matchesStage = stage === "all" || item.stage === stage;
      return matchesQuery && matchesStage;
    });

    result = [...result].sort((a, b) => {
      switch (sort) {
        case "oldest":
          return new Date(a.appliedAt).getTime() - new Date(b.appliedAt).getTime();
        case "score-desc":
          return (b.score ?? -1) - (a.score ?? -1);
        case "name":
          return a.name.localeCompare(b.name);
        default:
          return new Date(b.appliedAt).getTime() - new Date(a.appliedAt).getTime();
      }
    });

    return result;
  }, [items, query, stage, sort]);

  const rows: CandidateRow[] = filtered.map((item) => ({
    applicationId: item.applicationId,
    candidateId: item.candidateId,
    name: item.name,
    email: item.email,
    jobTitle: item.jobTitle,
    stage: item.stage,
    score: item.score,
    appliedAt: item.appliedAt,
    source: item.source,
    sourcePlatform: item.sourcePlatform,
    recommendation: item.recommendation,
  }));

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[240px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, email, or role…"
            className="pl-9"
          />
        </div>
        <Select value={stage} onChange={(e) => setStage(e.target.value)} className="w-56">
          <option value="all">All stages</option>
          {RECRUITMENT_STAGES.map((s) => (
            <option key={s} value={s}>
              {STAGE_META[s].label}
            </option>
          ))}
        </Select>
        <Select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className="w-48">
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="score-desc">Highest score</option>
          <option value="name">Name (A–Z)</option>
        </Select>
      </div>

      {rows.length === 0 ? (
        <EmptyState title="No candidates match your filters" description="Try adjusting your search or stage filter." />
      ) : (
        <CandidateTable rows={rows} />
      )}
    </div>
  );
}
