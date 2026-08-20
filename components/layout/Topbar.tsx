"use client";

import { useRouter } from "next/navigation";
import { Search, Bell } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/Input";
import { UserMenu } from "@/components/layout/UserMenu";

export interface TopbarProps {
  userName: string;
  userEmail: string;
  companyName: string;
}

export function Topbar({ userName, userEmail, companyName }: TopbarProps) {
  const router = useRouter();

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="pt-safe flex h-16 shrink-0 items-center gap-4 border-b border-border bg-background/80 px-4 backdrop-blur md:px-6">
      <div className="relative hidden w-full max-w-sm sm:block">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Search jobs, candidates…" className="pl-9" aria-label="Search" />
      </div>
      <span className="text-sm font-semibold text-foreground sm:hidden">Recruiting OS</span>

      <div className="ml-auto flex items-center gap-2">
        <button
          type="button"
          aria-label="Notifications"
          className="relative flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)] text-muted-foreground hover:bg-surface-elevated hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
        >
          <Bell className="h-4 w-4" />
        </button>
        <UserMenu userName={userName} userEmail={userEmail} companyName={companyName} onSignOut={signOut} />
      </div>
    </header>
  );
}
