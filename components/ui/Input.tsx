import { forwardRef } from "react";
import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils/cn";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={cn(
          "h-10 w-full rounded-[var(--radius-md)] border border-border bg-surface px-3 text-sm text-foreground placeholder:text-muted-foreground transition-colors duration-[var(--duration-fast)] focus-visible:outline-none focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/20",
          className
        )}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";
