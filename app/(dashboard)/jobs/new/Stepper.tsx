import { Check } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export type WizardStep = "requirement" | "understanding" | "generating" | "review" | "approved";

const STEPS: { key: WizardStep; label: string }[] = [
  { key: "requirement", label: "Requirement" },
  { key: "understanding", label: "AI Understanding" },
  { key: "generating", label: "Generated JD" },
  { key: "review", label: "Review & Edit" },
  { key: "approved", label: "Approve" },
];

export function Stepper({ current }: { current: WizardStep }) {
  const currentIndex = STEPS.findIndex((s) => s.key === current);

  return (
    <ol className="mb-8 flex items-center gap-2">
      {STEPS.map((step, i) => {
        const isDone = i < currentIndex;
        const isActive = i === currentIndex;

        return (
          <li key={step.key} className="flex flex-1 items-center gap-2">
            <div className="flex flex-1 items-center gap-2">
              <span
                className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-medium transition-colors duration-[var(--duration-fast)]",
                  isDone && "border-accent bg-accent text-accent-foreground",
                  isActive && "border-accent text-accent",
                  !isDone && !isActive && "border-border text-muted-foreground"
                )}
              >
                {isDone ? <Check className="h-3 w-3" /> : i + 1}
              </span>
              <span
                className={cn(
                  "hidden text-xs font-medium sm:block",
                  isActive ? "text-foreground" : "text-muted-foreground"
                )}
              >
                {step.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <span className={cn("h-px flex-1", isDone ? "bg-accent" : "bg-border")} />
            )}
          </li>
        );
      })}
    </ol>
  );
}
