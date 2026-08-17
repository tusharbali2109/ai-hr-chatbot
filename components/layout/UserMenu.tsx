"use client";

import { useState, useRef, useEffect } from "react";
import { LogOut } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export interface UserMenuProps {
  userName: string;
  userEmail: string;
  companyName: string;
  onSignOut: () => void;
}

export function UserMenu({ userName, userEmail, companyName, onSignOut }: UserMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const initial = userName.charAt(0).toUpperCase() || "?";

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-2 rounded-[var(--radius-md)] px-2 py-1.5 hover:bg-surface-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent/15 text-sm font-medium text-accent">
          {initial}
        </span>
        <span className="hidden text-left sm:block">
          <span className="block text-sm font-medium leading-tight text-foreground">{userName}</span>
          <span className="block text-xs leading-tight text-muted-foreground">{companyName}</span>
        </span>
      </button>

      <div
        role="menu"
        className={cn(
          "absolute right-0 top-full mt-2 w-56 origin-top-right rounded-[var(--radius-md)] border border-border bg-surface-elevated p-1.5 shadow-[var(--shadow-elevated)] transition-[opacity,transform] duration-[var(--duration-fast)] ease-[var(--ease-out)]",
          open ? "scale-100 opacity-100" : "pointer-events-none scale-95 opacity-0"
        )}
      >
        <div className="px-2.5 py-2">
          <p className="text-sm font-medium text-foreground">{userName}</p>
          <p className="truncate text-xs text-muted-foreground">{userEmail}</p>
        </div>
        <div className="my-1 h-px bg-border" />
        <button
          role="menuitem"
          onClick={onSignOut}
          className="flex w-full items-center gap-2 rounded-[var(--radius-sm)] px-2.5 py-2 text-left text-sm text-foreground hover:bg-surface"
        >
          <LogOut className="h-4 w-4 text-muted-foreground" />
          Sign out
        </button>
      </div>
    </div>
  );
}
