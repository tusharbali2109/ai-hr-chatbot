"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  className?: string;
}

/** Every dialog in the app goes through this one component (13 call sites —
 * every action panel, Create/Add flows, confirmations), so making it
 * mobile-aware here upgrades all of them at once: a centered dialog on
 * desktop, a bottom sheet on mobile (slides up, rounded top, drag handle,
 * safe-area padding) — the standard mobile pattern instead of a cramped
 * centered box. */
function useIsMobile(): boolean {
  // Lazy initializer reads the real value up front (SSR-safe: window is
  // undefined during server render, defaults to false) — the effect below
  // only subscribes to subsequent changes, never sets state synchronously
  // on its own first run.
  const [isMobile, setIsMobile] = useState(() => typeof window !== "undefined" && window.matchMedia("(max-width: 639px)").matches);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return isMobile;
}

export function Modal({ open, onClose, title, children, className }: ModalProps) {
  const isMobile = useIsMobile();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className={cn("fixed inset-0 z-50 flex", isMobile ? "items-end" : "items-center justify-center p-4")}>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
            aria-hidden
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            initial={isMobile ? { y: "100%" } : { opacity: 0, y: 12, scale: 0.98 }}
            animate={isMobile ? { y: 0 } : { opacity: 1, y: 0, scale: 1 }}
            exit={isMobile ? { y: "100%" } : { opacity: 0, y: 8, scale: 0.98 }}
            transition={isMobile ? { duration: 0.28, ease: [0.16, 1, 0.3, 1] } : { duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className={cn(
              "relative z-10 w-full border-border bg-surface-elevated shadow-[var(--shadow-elevated)]",
              isMobile
                ? "pb-safe max-h-[85vh] overflow-y-auto scrollbar-thin rounded-t-[var(--radius-xl)] border-t p-5"
                : "max-w-lg rounded-[var(--radius-lg)] border p-6",
              className
            )}
          >
            {isMobile && <div className="mx-auto mb-3 h-1 w-10 shrink-0 rounded-full bg-border" aria-hidden />}
            {title && (
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-foreground">{title}</h2>
                <button
                  onClick={onClose}
                  aria-label="Close"
                  className="rounded-md p-1 text-muted-foreground hover:bg-surface hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}
