"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils/cn";

export interface ScoreCardProps {
  label: string;
  score: number | null;
}

function toneForScore(score: number) {
  if (score >= 80) return "var(--success)";
  if (score >= 60) return "var(--info)";
  if (score >= 40) return "var(--warning)";
  return "var(--danger)";
}

export function ScoreCard({ label, score }: ScoreCardProps) {
  const value = score ?? 0;
  const circumference = 2 * Math.PI * 26;
  const offset = circumference * (1 - value / 100);
  const color = toneForScore(value);

  return (
    <div className="flex flex-col items-center gap-2 rounded-[var(--radius-lg)] border border-border bg-surface p-4">
      <div className="relative flex h-16 w-16 items-center justify-center">
        <svg viewBox="0 0 64 64" className="h-16 w-16 -rotate-90">
          <circle cx="32" cy="32" r="26" fill="none" stroke="var(--border)" strokeWidth="5" />
          <motion.circle
            cx="32"
            cy="32"
            r="26"
            fill="none"
            stroke={color}
            strokeWidth="5"
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: score == null ? circumference : offset }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          />
        </svg>
        <span className={cn("absolute text-sm font-semibold tabular-nums text-foreground")}>
          {score != null ? score : "—"}
        </span>
      </div>
      <span className="text-center text-xs text-muted-foreground">{label}</span>
    </div>
  );
}
