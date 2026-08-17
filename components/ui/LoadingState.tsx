import { cn } from "@/lib/utils/cn";

export function LoadingState({ label = "Loading", className }: { label?: string; className?: string }) {
  return (
    <div className={cn("flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground", className)}>
      <span className="relative flex h-4 w-4">
        <span className="absolute inset-0 animate-ping rounded-full bg-accent/40" />
        <span className="relative h-4 w-4 rounded-full bg-accent/70" />
      </span>
      {label}…
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-[var(--radius-sm)] bg-surface-elevated", className)} />;
}
