-- Phase 3: job board publishing + candidate ingestion infrastructure.
-- Additive only — no existing Phase 1/2 tables/columns are dropped or renamed.

-- ---------------------------------------------------------------------------
-- job_postings: one row per (job, platform) — a job can have many external
-- postings, one per platform. Republishing/retrying reuses the same row.
-- ---------------------------------------------------------------------------
create table if not exists job_postings (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs (id) on delete cascade,
  platform text not null,
  external_job_id text,
  external_url text,
  status text not null default 'DRAFT'
    check (status in ('DRAFT', 'QUEUED', 'PUBLISHING', 'PUBLISHED', 'PAUSED', 'CLOSED', 'FAILED')),
  published_at timestamptz,
  last_synced_at timestamptz,
  last_error text,
  sync_cursor text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (job_id, platform)
);

create index if not exists idx_job_postings_job_id on job_postings (job_id);
create index if not exists idx_job_postings_platform_external on job_postings (platform, external_job_id);

-- ---------------------------------------------------------------------------
-- job_board_credentials: per-company connection state for each platform.
-- The `credentials` column holds secrets and must never be selected by a
-- normal client-facing service call (see lib/services/jobboards.ts).
-- ---------------------------------------------------------------------------
create table if not exists job_board_credentials (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  platform text not null,
  status text not null default 'not_connected'
    check (status in ('not_connected', 'connected', 'error', 'unavailable')),
  capabilities jsonb not null default '{}'::jsonb,
  connected_at timestamptz,
  last_sync_at timestamptz,
  last_error text,
  credentials jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, platform)
);

create index if not exists idx_job_board_credentials_company_id on job_board_credentials (company_id);

-- ---------------------------------------------------------------------------
-- external_events: webhook idempotency ledger + audit log. Written by the
-- dedicated webhook service-role client (outside normal RLS-scoped writes),
-- since webhook requests arrive with no Supabase session.
-- ---------------------------------------------------------------------------
create table if not exists external_events (
  id uuid primary key default gen_random_uuid(),
  platform text not null,
  external_event_id text not null,
  event_type text not null,
  job_posting_id uuid references job_postings (id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  processed boolean not null default false,
  processed_at timestamptz,
  error text,
  created_at timestamptz not null default now(),
  unique (platform, external_event_id)
);

create index if not exists idx_external_events_job_posting_id on external_events (job_posting_id);
create index if not exists idx_external_events_processed on external_events (processed);

-- ---------------------------------------------------------------------------
-- internal_events: lightweight event log for future consumers (Phase 4
-- screening). Not a queue — just an append-only, queryable record.
-- ---------------------------------------------------------------------------
create table if not exists internal_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  application_id uuid references applications (id) on delete cascade,
  candidate_id uuid references candidates (id) on delete set null,
  job_id uuid references jobs (id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_internal_events_job_id on internal_events (job_id);
create index if not exists idx_internal_events_application_id on internal_events (application_id);

-- ---------------------------------------------------------------------------
-- candidate_duplicate_flags: uncertain candidate matches surfaced for manual
-- review rather than auto-merged. candidates is a global table (see 0001),
-- so this table is global too — consistent with that existing design.
-- ---------------------------------------------------------------------------
create table if not exists candidate_duplicate_flags (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references candidates (id) on delete cascade,
  possible_match_candidate_id uuid not null references candidates (id) on delete cascade,
  application_id uuid references applications (id) on delete cascade,
  match_signal text not null,
  status text not null default 'pending'
    check (status in ('pending', 'confirmed_duplicate', 'confirmed_distinct')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (candidate_id <> possible_match_candidate_id)
);

create index if not exists idx_candidate_duplicate_flags_candidate_id on candidate_duplicate_flags (candidate_id);

-- ---------------------------------------------------------------------------
-- applications: additive column carrying the precise ingestion platform slug
-- (linkedin/naukri/indeed/mock/...) without touching the existing `source`
-- check constraint.
-- ---------------------------------------------------------------------------
alter table applications
  add column if not exists source_platform text;

create index if not exists idx_applications_source_platform on applications (source_platform);

-- ---------------------------------------------------------------------------
-- updated_at triggers (reuses set_updated_at() from 0001_init.sql)
-- ---------------------------------------------------------------------------
create trigger trg_job_postings_updated_at before update on job_postings
  for each row execute function set_updated_at();
create trigger trg_job_board_credentials_updated_at before update on job_board_credentials
  for each row execute function set_updated_at();
create trigger trg_candidate_duplicate_flags_updated_at before update on candidate_duplicate_flags
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table job_postings enable row level security;
alter table job_board_credentials enable row level security;
alter table external_events enable row level security;
alter table internal_events enable row level security;
alter table candidate_duplicate_flags enable row level security;

-- job_postings: scoped through jobs.company_id, same two-hop pattern as applications
create policy "Users can view job postings for their company's jobs" on job_postings
  for select using (
    job_id in (select id from jobs where company_id = current_company_id())
  );
create policy "Users can create job postings for their company's jobs" on job_postings
  for insert with check (
    job_id in (select id from jobs where company_id = current_company_id())
  );
create policy "Users can update job postings for their company's jobs" on job_postings
  for update using (
    job_id in (select id from jobs where company_id = current_company_id())
  );

-- job_board_credentials: directly company-scoped, same pattern as jobs
create policy "Users can view their company's job board credentials" on job_board_credentials
  for select using (company_id = current_company_id());
create policy "Users can create their company's job board credentials" on job_board_credentials
  for insert with check (company_id = current_company_id());
create policy "Users can update their company's job board credentials" on job_board_credentials
  for update using (company_id = current_company_id());

-- external_events: only visible once resolved to a job_posting belonging to
-- the caller's company; all writes go through the service-role webhook client.
create policy "Users can view external events for their company's postings" on external_events
  for select using (
    job_posting_id in (
      select jp.id from job_postings jp
      join jobs j on j.id = jp.job_id
      where j.company_id = current_company_id()
    )
  );

-- internal_events: select-only, two-hop through jobs.company_id
create policy "Users can view internal events for their company's jobs" on internal_events
  for select using (
    job_id in (select id from jobs where company_id = current_company_id())
  );
create policy "Users can create internal events for their company's jobs" on internal_events
  for insert with check (
    job_id in (select id from jobs where company_id = current_company_id())
  );

-- candidate_duplicate_flags: global/authenticated-only, matching candidates' own RLS
create policy "Authenticated users can view duplicate flags" on candidate_duplicate_flags
  for select using (auth.uid() is not null);
create policy "Authenticated users can create duplicate flags" on candidate_duplicate_flags
  for insert with check (auth.uid() is not null);
create policy "Authenticated users can update duplicate flags" on candidate_duplicate_flags
  for update using (auth.uid() is not null);
