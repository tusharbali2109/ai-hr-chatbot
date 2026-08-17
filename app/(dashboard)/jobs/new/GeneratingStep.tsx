"use client";

import { motion } from "framer-motion";
import { Check, Circle, Loader2, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export interface GeneratingStepProps {
  /** true once the JD-generation request has resolved */
  done: boolean;
}

const ITEMS = [
  "Understanding your hiring requirement",
  "Extracting skills and experience range",
  "Writing the job description",
  "Preparing screening criteria",
];

export function GeneratingStep({ done }: GeneratingStepProps) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center rounded-[var(--radius-xl)] border border-border bg-surface p-8 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/10 text-accent">
        <Sparkles className="h-5 w-5" />
      </div>
      <h2 className="mt-4 text-base font-semibold text-foreground">AI Recruitment Assistant</h2>

      <ul className="mt-6 flex w-full flex-col gap-3 text-left">
        {ITEMS.map((item, i) => {
          // Items 0-1 (understanding + extraction) already happened before this
          // screen was reached. Items 2-3 both occur inside the single in-flight
          // JD-generation request, so they share one real pending/done state.
          const complete = i < 2 || done;
          const active = i >= 2 && !done;

          return (
            <motion.li
              key={item}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: i * 0.08, ease: [0.16, 1, 0.3, 1] }}
              className="flex items-center gap-3 text-sm"
            >
              {complete ? (
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-success/15 text-success">
                  <Check className="h-3 w-3" />
                </span>
              ) : active ? (
                <Loader2 className="h-5 w-5 shrink-0 animate-spin text-accent" />
              ) : (
                <Circle className="h-5 w-5 shrink-0 text-muted-foreground/40" />
              )}
              <span className={cn(complete ? "text-foreground" : active ? "text-foreground" : "text-muted-foreground")}>
                {item}
              </span>
            </motion.li>
          );
        })}
      </ul>

      {done && <p className="mt-6 text-sm font-medium text-success">Your JD is ready for review.</p>}
    </div>
  );
}
