"use client";

import { ArrowRight } from "lucide-react";

/**
 * Mobile-only sticky CTA pointing at whichever action section is actually
 * next for this candidate — the four action panels (Screening/Interview/
 * Assessment/Scheduling) stay exactly where they are and keep their own
 * logic untouched (zero duplicated eligibility rules, zero regression
 * risk); this just makes the relevant one reachable in one tap instead of
 * scrolling through a long page to find it. Replaces the global bottom nav
 * on this route (see MobileBottomNav's pathname check) since a candidate
 * detail page's own next-step action is the more useful thing to keep
 * thumb-reachable here than the app-wide tab bar.
 */
export function MobileNextActionBar({ label, targetId }: { label: string; targetId: string }) {
  function handleClick() {
    document.getElementById(targetId)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 p-3 backdrop-blur-md md:hidden">
      <button
        type="button"
        onClick={handleClick}
        className="flex w-full items-center justify-center gap-2 rounded-[var(--radius-lg)] bg-accent px-4 py-3 text-sm font-medium text-accent-foreground shadow-[var(--shadow-soft)] transition-transform duration-[var(--duration-fast)] active:scale-[0.98]"
      >
        {label}
        <ArrowRight className="h-4 w-4" />
      </button>
    </div>
  );
}
