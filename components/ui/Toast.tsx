"use client";

import { createContext, useCallback, useContext, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, AlertTriangle, Info, X } from "lucide-react";
import { cn } from "@/lib/utils/cn";

type ToastTone = "success" | "danger" | "info";

interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
}

interface ToastContextValue {
  showToast: (message: string, tone?: ToastTone) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const icons: Record<ToastTone, React.ElementType> = {
  success: CheckCircle2,
  danger: AlertTriangle,
  info: Info,
};

const toneClasses: Record<ToastTone, string> = {
  success: "text-success",
  danger: "text-danger",
  info: "text-info",
};

const noopSubscribe = () => () => {};

function useMounted() {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false
  );
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const mounted = useMounted();

  const showToast = useCallback((message: string, tone: ToastTone = "success") => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, tone }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3500);
  }, []);

  const dismiss = (id: number) => setToasts((prev) => prev.filter((t) => t.id !== id));

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {mounted &&
        createPortal(
          <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex flex-col gap-2">
            <AnimatePresence>
              {toasts.map((t) => {
                const Icon = icons[t.tone];
                return (
                  <motion.div
                    key={t.id}
                    initial={{ opacity: 0, y: 12, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, x: 24 }}
                    transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                    className="pointer-events-auto flex items-center gap-2.5 rounded-[var(--radius-md)] border border-border bg-surface-elevated px-4 py-3 text-sm text-foreground shadow-[var(--shadow-elevated)]"
                  >
                    <Icon className={cn("h-4 w-4 shrink-0", toneClasses[t.tone])} />
                    <span>{t.message}</span>
                    <button
                      onClick={() => dismiss(t.id)}
                      aria-label="Dismiss notification"
                      className="ml-1 text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>,
          document.body
        )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
