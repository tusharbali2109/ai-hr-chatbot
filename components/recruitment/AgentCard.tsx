import type { LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/Badge";

export type AgentStatus = "Idle" | "Running" | "Completed" | "Waiting" | "Failed" | "Needs Review";

const STATUS_TONE: Record<AgentStatus, "neutral" | "info" | "success" | "warning" | "danger"> = {
  Idle: "neutral",
  Running: "info",
  Completed: "success",
  Waiting: "warning",
  Failed: "danger",
  "Needs Review": "warning",
};

export interface AgentCardProps {
  name: string;
  description: string;
  icon: LucideIcon;
  status: AgentStatus;
  lastActivity: string;
}

export function AgentCard({ name, description, icon: Icon, status, lastActivity }: AgentCardProps) {
  return (
    <div className="flex flex-col gap-4 rounded-[var(--radius-lg)] border border-border bg-surface p-5 transition-colors duration-[var(--duration-fast)] hover:border-[color-mix(in_srgb,var(--accent)_30%,var(--border))]">
      <div className="flex items-start justify-between gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-[var(--radius-md)] bg-accent/10 text-accent">
          <Icon className="h-5 w-5" />
        </div>
        <Badge tone={STATUS_TONE[status]}>{status}</Badge>
      </div>
      <div>
        <h3 className="text-sm font-semibold text-foreground">{name}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      <p className="mt-auto text-xs text-muted-foreground">Last activity: {lastActivity}</p>
    </div>
  );
}
