import { GitCommitHorizontal } from "lucide-react";
import { STAGE_META, type RecruitmentStage } from "@/lib/stages";

export interface ActivityEntry {
  id: string;
  description: string;
  toStage: RecruitmentStage;
  createdAt: string;
}

function relativeTime(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 60) return `${Math.max(mins, 0)}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function ActivityFeed({ entries }: { entries: ActivityEntry[] }) {
  return (
    <ul className="flex flex-col gap-1">
      {entries.map((entry) => {
        const meta = STAGE_META[entry.toStage];
        return (
          <li key={entry.id} className="flex items-start gap-3 rounded-[var(--radius-md)] px-2 py-2.5 hover:bg-surface">
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-elevated text-muted-foreground">
              <GitCommitHorizontal className="h-3.5 w-3.5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-foreground">{entry.description}</p>
              <p className="text-xs text-muted-foreground">
                {meta.label} · {relativeTime(entry.createdAt)}
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
