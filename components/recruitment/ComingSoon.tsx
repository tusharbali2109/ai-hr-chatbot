import type { LucideIcon } from "lucide-react";
import { Sparkles } from "lucide-react";

export interface ComingSoonProps {
  icon?: LucideIcon;
  title: string;
  description: string;
}

export function ComingSoon({ icon: Icon = Sparkles, title, description }: ComingSoonProps) {
  return (
    <div className="mx-auto flex max-w-7xl flex-col items-center justify-center px-6 py-24 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-[var(--radius-lg)] bg-accent/10 text-accent">
        <Icon className="h-6 w-6" />
      </div>
      <h1 className="mt-5 text-xl font-semibold tracking-tight text-foreground">{title}</h1>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">{description}</p>
      <span className="mt-5 rounded-full border border-border bg-surface-elevated px-3 py-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Coming Soon
      </span>
    </div>
  );
}
