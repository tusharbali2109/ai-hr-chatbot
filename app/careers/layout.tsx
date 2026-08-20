import Link from "next/link";
import { Sparkles } from "lucide-react";

export default function CareersLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-col bg-background">
      <header className="sticky top-0 z-10 border-b border-border bg-surface/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-4xl items-center px-6">
          <Link href="/careers" className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-sm)] bg-accent text-accent-foreground">
              <Sparkles className="h-4 w-4" />
            </div>
            <span className="text-sm font-semibold tracking-tight text-foreground">Careers</span>
          </Link>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-border">
        <div className="mx-auto max-w-4xl px-6 py-8 text-center text-xs text-muted-foreground">
          Powered by Recruiting OS
        </div>
      </footer>
    </div>
  );
}
