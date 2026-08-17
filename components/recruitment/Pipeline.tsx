"use client";

import { motion } from "framer-motion";
import { PIPELINE_STAGES, STAGE_META, type RecruitmentStage } from "@/lib/stages";
import { cn } from "@/lib/utils/cn";

export interface PipelineProps {
  counts: Partial<Record<RecruitmentStage, number>>;
  activeStage?: RecruitmentStage;
  onSelectStage?: (stage: RecruitmentStage) => void;
}

export function Pipeline({ counts, activeStage, onSelectStage }: PipelineProps) {
  const max = Math.max(1, ...PIPELINE_STAGES.map((s) => counts[s] ?? 0));

  return (
    <div className="flex items-stretch gap-2 overflow-x-auto scrollbar-thin pb-1">
      {PIPELINE_STAGES.map((stage, i) => {
        const count = counts[stage] ?? 0;
        const meta = STAGE_META[stage];
        const isActive = activeStage === stage;
        const height = 8 + (count / max) * 40;

        return (
          <button
            key={stage}
            type="button"
            onClick={() => onSelectStage?.(stage)}
            className={cn(
              "group flex min-w-[120px] flex-1 flex-col gap-3 rounded-[var(--radius-lg)] border px-4 py-4 text-left transition-colors duration-[var(--duration-fast)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
              isActive
                ? "border-accent/40 bg-accent/10"
                : "border-border bg-surface hover:border-[color-mix(in_srgb,var(--accent)_35%,var(--border))]"
            )}
          >
            <div className="flex items-center justify-between">
              <span className="text-2xl font-semibold tabular-nums text-foreground">{count}</span>
              <span className="text-xs text-muted-foreground">{i + 1}</span>
            </div>
            <div className="h-12 flex items-end">
              <motion.div
                initial={{ height: 0 }}
                animate={{ height }}
                transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1], delay: i * 0.04 }}
                className={cn("w-full rounded-[var(--radius-sm)]", isActive ? "bg-accent" : "bg-accent/40")}
              />
            </div>
            <span className="text-xs font-medium text-muted-foreground group-hover:text-foreground">
              {meta.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
