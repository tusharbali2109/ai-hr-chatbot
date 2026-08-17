"use client";

import { motion } from "framer-motion";
import { Check } from "lucide-react";
import { STAGE_META, type RecruitmentStage } from "@/lib/stages";
import { cn } from "@/lib/utils/cn";

export interface TimelineEntry {
  stage: RecruitmentStage;
  date: string | null;
  reached: boolean;
}

export function Timeline({ entries }: { entries: TimelineEntry[] }) {
  return (
    <ol className="flex flex-col">
      {entries.map((entry, i) => {
        const meta = STAGE_META[entry.stage];
        const isLast = i === entries.length - 1;

        return (
          <li key={entry.stage} className="relative flex gap-3 pb-6 last:pb-0">
            {!isLast && (
              <span
                className={cn(
                  "absolute left-[11px] top-6 h-full w-px",
                  entry.reached ? "bg-accent/40" : "bg-border"
                )}
              />
            )}
            <motion.span
              initial={{ scale: 0.7, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.3, delay: i * 0.05, ease: [0.16, 1, 0.3, 1] }}
              className={cn(
                "z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2",
                entry.reached
                  ? "border-accent bg-accent text-accent-foreground"
                  : "border-border bg-surface text-muted-foreground"
              )}
            >
              {entry.reached && <Check className="h-3 w-3" />}
            </motion.span>
            <div className="pt-0.5">
              <p className={cn("text-sm font-medium", entry.reached ? "text-foreground" : "text-muted-foreground")}>
                {meta.label}
              </p>
              <p className="text-xs text-muted-foreground">
                {entry.date
                  ? new Date(entry.date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
                  : "Not reached yet"}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
