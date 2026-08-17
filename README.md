# AI Recruitment Platform — Phase 1 + Phase 2

A new Next.js/Supabase recruitment platform, built alongside (not replacing) the
existing PHP AI-interview bot in `../ai_hr_bot`. Phase 1 covers the foundation
(auth, schema, Jobs/Candidates/Applications, dashboard, design system). Phase 2
adds the AI Requirement → JD Creation workflow.

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy `.env.example` to `.env.local` and fill in:
   - Your Supabase project's URL and anon key (Supabase dashboard → Project Settings → API)
   - Your Anthropic API key (`ANTHROPIC_API_KEY`) — used server-side only by the
     Requirement Agent and JD Generation Agent (`lib/ai/anthropic-provider.ts`).
     Never exposed to the browser.
   ```bash
   cp .env.example .env.local
   ```
3. Run the migrations in `supabase/migrations/` against your Supabase project, in order
   (`0001_init.sql`, then `0002_phase2_jd.sql`) — SQL Editor in the dashboard, or the Supabase CLI.
4. Create at least one `companies` row and one `auth.users` + matching `users` row
   (with that `company_id`) so a login has somewhere to belong — RLS scopes every
   query to the signed-in user's company.
5. Seed demo data:
   ```bash
   npm run seed
   ```
6. Start the dev server:
   ```bash
   npm run dev
   ```
7. Run tests:
   ```bash
   npm run test
   ```

## Structure

- `app/` — routes (App Router). `(auth)/login` is public; everything under
  `(dashboard)/` requires a signed-in Supabase session (enforced in `proxy.ts`).
- `app/(dashboard)/jobs/new/` — the Phase 2 AI workspace: Requirement → AI
  Understanding → Generated JD → Review & Edit → Approve.
- `components/ui/` — design system primitives (Button, Input, Modal, Toast, …).
- `components/layout/` — Sidebar/Topbar app shell.
- `components/recruitment/` — domain components (JobCard, CandidateTable, Pipeline, …).
- `lib/ai/` — the AI provider abstraction. `provider.ts` is the interface
  (`generateStructuredRequirement`, `generateJD`, `improveJD`); `anthropic-provider.ts`
  is the current implementation (Claude, structured outputs). Swap providers by
  changing `lib/ai/index.ts` only — nothing else references Anthropic directly.
- `lib/jd/logic.ts` — pure, framework-free JD workflow logic (validation,
  critical-field diffing, authorization checks, version numbering). Covered by
  `lib/jd/logic.test.ts` and `lib/ai/schemas.test.ts` (Vitest).
- `lib/services/` — the only layer allowed to talk to Supabase for business data;
  pages/actions call these, never the Supabase client directly. This is the seam
  future AI agents/services will plug into.
- `lib/actions/jd.ts` — server actions for the JD workflow (extract requirement,
  generate/regenerate/improve JD, save edits, approve). Never called from a
  component without going through these.
- `lib/stages.ts` — single source of truth for recruitment stage names, used by
  the DB check constraint, Pipeline, and Timeline components.
- `lib/demo-data/` — seed script and fixtures, kept separate from real query paths.
- `supabase/migrations/` — SQL schema, indexes, and RLS policies.

## Phase 2: Requirement → JD workflow

`Create Job` now opens `/jobs/new`, a 5-step AI workspace:

1. **Requirement** — free-text description + optional structured fields.
2. **AI Understanding** — the Requirement Agent's structured extraction, shown
   as a completeness checklist (not a confidence score). If the requirement is
   too vague, the AI asks one clarifying question with suggested options
   instead of inventing details.
3. **Generated JD** — the JD Generation Agent drafts the JD and a structured
   `screening_criteria` payload (mandatory/preferred skills with importance
   weights, experience range) for the future Phase 4 screening agent.
4. **Review & Edit** — every field is editable. "Ask AI to improve" and
   "Regenerate with AI" both produce a new draft you compare against the
   current version before applying — critical fields (experience, mandatory
   skills) are called out explicitly, never silently changed.
5. **Approve** — validated (title, description, ≥1 responsibility, structured
   skills, company association) before `jd_status` can become `APPROVED`.

Every save creates an immutable `job_jd_versions` row; the approved version is
flagged via a partial unique index (`job_jd_versions.is_approved`, one per job).

AI output is never trusted blindly: every response is validated against a Zod
schema (`lib/ai/schemas.ts`) before it touches the database, with one retry on
malformed output before surfacing an error.

## Scope

No AI JD generation beyond what's above, no job-board integrations, no
candidate ingestion/screening, no voice interviews, no assessments, no email
automation, no Google Calendar. Those sections render as static "Coming Soon"
cards. The "AI Interview" sidebar item is a placeholder — linking it to the
existing PHP interview bot is a deliberately separate, later step.

## Testing notes

`lib/jd/logic.test.ts` and `lib/ai/schemas.test.ts` cover requirement/JD schema
validation (valid + malformed AI output), missing-information/clarification
handling, JD-approval validation, critical-field diffing, authorization
(company ownership checks), and version numbering — all pure logic, so they run
without a database or network access. Server actions in `lib/actions/jd.ts` and
`lib/services/jd.ts` are *not* covered by automated tests here — they depend on
`next/headers` request context and a live Supabase connection, which would need
an integration-test harness (e.g. a test Supabase project + Next request mocking)
beyond this pass's scope. Exercise those manually via the `/jobs/new` flow once
your Supabase and Anthropic credentials are in `.env.local`.
