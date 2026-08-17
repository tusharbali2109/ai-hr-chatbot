"use client";

import { useState } from "react";
import { X, Plus } from "lucide-react";
import { Badge } from "@/components/ui/Badge";

export function ChipListEditor({
  items,
  onChange,
  tone = "neutral",
  placeholder = "Add and press Enter",
}: {
  items: string[];
  onChange: (items: string[]) => void;
  tone?: "accent" | "info" | "neutral";
  placeholder?: string;
}) {
  const [draft, setDraft] = useState("");

  function commit() {
    const value = draft.trim();
    if (value && !items.includes(value)) onChange([...items, value]);
    setDraft("");
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-[var(--radius-md)] border border-border bg-background p-2">
      {items.map((item) => (
        <Badge key={item} tone={tone} className="gap-1 pr-1">
          {item}
          <button
            type="button"
            onClick={() => onChange(items.filter((i) => i !== item))}
            aria-label={`Remove ${item}`}
            className="rounded-full p-0.5 hover:bg-black/10"
          >
            <X className="h-3 w-3" />
          </button>
        </Badge>
      ))}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          }
        }}
        onBlur={commit}
        placeholder={placeholder}
        className="min-w-[120px] flex-1 bg-transparent px-1 py-1 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none"
      />
      <button
        type="button"
        onClick={commit}
        aria-label="Add"
        className="rounded-full p-1 text-muted-foreground hover:bg-surface-elevated hover:text-foreground"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
