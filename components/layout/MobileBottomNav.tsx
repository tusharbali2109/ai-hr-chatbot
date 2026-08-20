"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Briefcase, Users, FileText, Menu, X } from "lucide-react";
import { NAV_ITEMS } from "@/lib/navigation";
import { cn } from "@/lib/utils/cn";

// Bottom nav caps at 4-5 destinations by design (thumb-reachable, not a
// re-hash of the full sidebar) — these are the highest-traffic screens;
// everything else lives one tap away behind "More".
const PRIMARY_HREFS = ["/dashboard", "/jobs", "/candidates", "/applications"];
const PRIMARY_ICONS = { "/dashboard": LayoutDashboard, "/jobs": Briefcase, "/candidates": Users, "/applications": FileText };

// Routes with their own page-specific sticky mobile action bar (see e.g.
// MobileNextActionBar on the candidate detail page) replace the global tab
// bar entirely rather than stacking two fixed bottom bars.
const REPLACED_BY_PAGE_ACTION_BAR = [/^\/candidates\/[^/]+$/];

export function MobileBottomNav() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  if (REPLACED_BY_PAGE_ACTION_BAR.some((pattern) => pattern.test(pathname))) return null;

  const primaryItems = PRIMARY_HREFS.map((href) => NAV_ITEMS.find((item) => item.href === href)!).filter(Boolean);
  const moreItems = NAV_ITEMS.filter((item) => !PRIMARY_HREFS.includes(item.href));
  const isMoreActive = moreItems.some((item) => pathname === item.href || pathname.startsWith(`${item.href}/`));

  return (
    <>
      <nav
        className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 backdrop-blur-md md:hidden"
        aria-label="Primary mobile"
      >
        <div className="flex items-stretch">
          {primaryItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = PRIMARY_ICONS[item.href as keyof typeof PRIMARY_ICONS] ?? item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex flex-1 flex-col items-center gap-1 py-2.5 transition-colors duration-[var(--duration-fast)]"
              >
                <span
                  className={cn(
                    "flex h-8 w-11 items-center justify-center rounded-full transition-colors duration-[var(--duration-fast)]",
                    isActive ? "bg-accent/15 text-accent" : "text-muted-foreground"
                  )}
                >
                  <Icon className="h-5 w-5" />
                </span>
                <span className={cn("text-[10px] font-medium", isActive ? "text-accent" : "text-muted-foreground")}>{item.label}</span>
              </Link>
            );
          })}

          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            className="flex flex-1 flex-col items-center gap-1 py-2.5"
            aria-label="More"
          >
            <span
              className={cn(
                "flex h-8 w-11 items-center justify-center rounded-full transition-colors duration-[var(--duration-fast)]",
                isMoreActive ? "bg-accent/15 text-accent" : "text-muted-foreground"
              )}
            >
              <Menu className="h-5 w-5" />
            </span>
            <span className={cn("text-[10px] font-medium", isMoreActive ? "text-accent" : "text-muted-foreground")}>More</span>
          </button>
        </div>
      </nav>

      {/* Bottom sheet for the rest of the nav — slides up, rounded top, drag handle, safe-area padding. */}
      {moreOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMoreOpen(false)} />
          <div
            className="pb-safe absolute inset-x-0 bottom-0 animate-[sheet-up_var(--duration-slow)_var(--ease-out)] rounded-t-[var(--radius-xl)] border-t border-border bg-surface shadow-[var(--shadow-elevated)]"
          >
            <div className="flex items-center justify-between px-5 pt-4">
              <span className="mx-auto h-1 w-10 rounded-full bg-border" />
              <button
                type="button"
                onClick={() => setMoreOpen(false)}
                aria-label="Close"
                className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-surface-elevated"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-3 px-5 py-6">
              {moreItems.map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMoreOpen(false)}
                    className={cn(
                      "flex flex-col items-center gap-2 rounded-[var(--radius-lg)] border p-4 text-center transition-colors duration-[var(--duration-fast)] active:scale-[0.97]",
                      isActive ? "border-accent/40 bg-accent/10 text-accent" : "border-border bg-surface-elevated text-foreground"
                    )}
                  >
                    <Icon className="h-5 w-5" />
                    <span className="text-xs font-medium">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
