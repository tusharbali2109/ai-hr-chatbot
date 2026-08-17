"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useInView } from "framer-motion";
import type { ReactNode } from "react";

export interface StatCounterProps {
  label: string;
  value: number;
  /** A rendered icon element (e.g. `<Briefcase className="h-4 w-4" />`), not
   * a bare component reference — a lucide-react component itself can't
   * cross the Server->Client Component boundary (it's not a plain
   * serializable value), but a JSX element can. */
  icon: ReactNode;
}

export function StatCounter({ label, value, icon }: StatCounterProps) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (!inView) return;
    const duration = 700;
    const start = performance.now();

    function tick(now: number) {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(eased * value));
      if (progress < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }, [inView, value]);

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 8 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="flex flex-col gap-2 rounded-[var(--radius-lg)] border border-border bg-surface p-4"
    >
      <div className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-sm)] bg-accent/10 text-accent">
        {icon}
      </div>
      <span className="text-2xl font-semibold tabular-nums text-foreground">{display}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </motion.div>
  );
}
