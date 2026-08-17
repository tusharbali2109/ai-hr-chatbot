import { CheckCircle2, CircleAlert, ExternalLink, Play, Settings2, Terminal } from "lucide-react";

const steps = [
  { title: "Terminal project ke main folder me kholen", detail: "Path ai-hr-chatbot-main hona chahiye. Ab root se bhi command seedhe chalegi.", command: "cd C:\\Users\\DELL\\Desktop\\ai-hr-chatbot-main" },
  { title: "Dependencies install karen", detail: "First run ya package update ke baad ye command chalani hai.", command: "npm run setup" },
  { title: "Environment configure karen", detail: "web/.env.local me Supabase URL, anon key aur service-role key bharni hain. AI JD generation ke liye Anthropic key bhi required hai.", command: "notepad web\\.env.local" },
  { title: "Database migrations run karen", detail: "Supabase Dashboard ke SQL Editor me web/supabase/combined_migrations.sql ko run karen. Naye project me Data API access/grants bhi verify karen." },
  { title: "Demo company aur login user banayen", detail: "web/.env.local me SEED_* values set karne ke baad seed command ek demo account ready karegi.", command: "npm run seed" },
  { title: "Bot start karen", detail: "Server ready hone par browser me http://localhost:3000 open karen aur seeded email/password se login karen.", command: "npm run dev" },
];

const keys = [
  ["NEXT_PUBLIC_SUPABASE_URL", "Required", "Supabase project URL"],
  ["NEXT_PUBLIC_SUPABASE_ANON_KEY", "Required", "Supabase publishable/anon key"],
  ["SUPABASE_SERVICE_ROLE_KEY", "Required", "Server-only seed and webhooks"],
  ["ANTHROPIC_API_KEY", "AI features", "JD, screening, interview and assessment agents"],
  ["RESEND_API_KEY + RESEND_FROM_EMAIL", "Real email", "Email delivery"],
  ["TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN + TWILIO_PHONE_NUMBER", "Real calls", "Set VOICE_PROVIDER=twilio"],
  ["TWILIO_VOICE_WEBHOOK_BASE_URL", "Real calls", "Public HTTPS webhook origin"],
  ["GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET", "Calendar", "Google Calendar OAuth"],
  ["GOOGLE_OAUTH_REDIRECT_BASE_URL", "Calendar", "OAuth callback app origin"],
  ["CRON_SECRET", "Automation", "Reminder and expiration cron routes"],
] as const;

export default function InstructionsPage() {
  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="mb-8">
        <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-accent/10 text-accent"><Play className="h-5 w-5" /></div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Software Run Karne Ka Process</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">Neeche diye steps ko order me follow karen. Commands project ke main folder se chalengi—ab <code className="rounded bg-surface-elevated px-1.5 py-0.5 text-foreground">package.json missing</code> error nahi aayega.</p>
      </div>
      <div className="grid gap-4">
        {steps.map((step, index) => (
          <section key={step.title} className="rounded-xl border border-border bg-surface p-5 shadow-[var(--shadow-soft)]">
            <div className="flex gap-4">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-semibold text-accent-foreground">{index + 1}</div>
              <div className="min-w-0 flex-1">
                <h2 className="font-semibold text-foreground">{step.title}</h2>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">{step.detail}</p>
                {step.command && <div className="mt-3 flex items-center gap-2 overflow-x-auto rounded-lg border border-border bg-background px-3 py-2.5 font-mono text-sm text-foreground"><Terminal className="h-4 w-4 shrink-0 text-accent" /><code>{step.command}</code></div>}
              </div>
            </div>
          </section>
        ))}
      </div>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <section className="rounded-xl border border-success/25 bg-success/5 p-5">
          <h2 className="flex items-center gap-2 font-semibold text-foreground"><CheckCircle2 className="h-4 w-4 text-success" />Quick health check</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">Code verify karne ke liye:</p>
          <code className="mt-3 block rounded-lg border border-border bg-background px-3 py-2.5 font-mono text-sm text-foreground">npm run check</code>
        </section>
        <section className="rounded-xl border border-warning/25 bg-warning/5 p-5">
          <h2 className="flex items-center gap-2 font-semibold text-foreground"><CircleAlert className="h-4 w-4 text-warning" />Common issue</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">Login fail ho to Supabase keys, migrated tables aur seeded user check karen. AI generation fail ho to ANTHROPIC_API_KEY set karen.</p>
        </section>
      </div>
      <section className="mt-6 overflow-hidden rounded-xl border border-border bg-surface">
        <div className="border-b border-border px-5 py-4"><h2 className="font-semibold text-foreground">API keys checklist</h2><p className="mt-1 text-sm text-muted-foreground">Required ya live-feature wali values replace karen. Server secrets ko NEXT_PUBLIC prefix kabhi na dein.</p></div>
        <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm"><thead className="bg-surface-elevated text-xs uppercase text-muted-foreground"><tr><th className="px-4 py-3">Environment variable</th><th className="px-4 py-3">Needed for</th><th className="px-4 py-3">Purpose</th></tr></thead><tbody>{keys.map(([name, needed, purpose]) => <tr key={name} className="border-t border-border-subtle"><td className="px-4 py-3 font-mono text-xs text-foreground">{name}</td><td className="px-4 py-3 text-foreground">{needed}</td><td className="px-4 py-3 text-muted-foreground">{purpose}</td></tr>)}</tbody></table></div>
      </section>
      <div className="mt-6 flex flex-wrap gap-4 text-sm">
        <a className="inline-flex items-center gap-1.5 text-accent hover:underline" href="https://supabase.com/dashboard" target="_blank" rel="noreferrer"><Settings2 className="h-4 w-4" />Supabase Dashboard<ExternalLink className="h-3.5 w-3.5" /></a>
        <a className="inline-flex items-center gap-1.5 text-accent hover:underline" href="http://localhost:3000" target="_blank" rel="noreferrer"><Play className="h-4 w-4" />Open local bot<ExternalLink className="h-3.5 w-3.5" /></a>
      </div>
    </div>
  );
}
