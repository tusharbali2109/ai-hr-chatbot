-- ============================================================
-- 0001_init.sql
-- ============================================================
-- Phase 1 schema: companies, users, jobs, candidates, applications, stage_history
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- companies
-- ---------------------------------------------------------------------------
create table if not exists companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  logo_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- users (application profile row linked 1:1 to auth.users)
-- ---------------------------------------------------------------------------
create table if not exists users (
  id uuid primary key references auth.users (id) on delete cascade,
  company_id uuid not null references companies (id) on delete cascade,
  name text not null,
  email text not null unique,
  role text not null default 'recruiter' check (role in ('admin', 'recruiter', 'hiring_manager')),
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_users_company_id on users (company_id);

-- ---------------------------------------------------------------------------
-- jobs
-- ---------------------------------------------------------------------------
create table if not exists jobs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  title text not null,
  description text not null default '',
  status text not null default 'draft' check (status in ('draft', 'open', 'paused', 'closed')),
  location text not null default '',
  employment_type text not null default 'full_time'
    check (employment_type in ('full_time', 'part_time', 'contract', 'internship')),
  experience_min int not null default 0,
  experience_max int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_jobs_company_id on jobs (company_id);
create index if not exists idx_jobs_status on jobs (status);

-- ---------------------------------------------------------------------------
-- candidates (reusable profile, not tied to a single job)
-- ---------------------------------------------------------------------------
create table if not exists candidates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  phone text,
  location text,
  resume_url text,
  linkedin_url text,
  portfolio_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_candidates_email on candidates (email);

-- ---------------------------------------------------------------------------
-- applications (candidate <-> job join, owns the recruitment stage)
-- ---------------------------------------------------------------------------
create table if not exists applications (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references candidates (id) on delete cascade,
  job_id uuid not null references jobs (id) on delete cascade,
  current_stage text not null default 'APPLIED' check (current_stage in (
    'APPLIED', 'AI_SCREENING', 'SHORTLISTED', 'SKILL_VERIFICATION', 'AI_INTERVIEW',
    'INTERVIEW_SHORTLISTED', 'ASSESSMENT_SENT', 'ASSESSMENT_SUBMITTED', 'ASSESSMENT_EVALUATED',
    'FINAL_SHORTLISTED', 'INTERVIEW_SCHEDULED', 'FINAL_INTERVIEW', 'SELECTED', 'REJECTED'
  )),
  overall_score numeric(5, 2),
  source text not null default 'career_site'
    check (source in ('career_site', 'linkedin', 'referral', 'job_board', 'agency')),
  applied_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (candidate_id, job_id)
);

create index if not exists idx_applications_candidate_id on applications (candidate_id);
create index if not exists idx_applications_job_id on applications (job_id);
create index if not exists idx_applications_current_stage on applications (current_stage);

-- ---------------------------------------------------------------------------
-- stage_history (audit trail for every stage transition)
-- ---------------------------------------------------------------------------
create table if not exists stage_history (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references applications (id) on delete cascade,
  from_stage text,
  to_stage text not null,
  changed_by uuid references users (id) on delete set null,
  reason text,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_stage_history_application_id on stage_history (application_id);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_companies_updated_at before update on companies
  for each row execute function set_updated_at();
create trigger trg_users_updated_at before update on users
  for each row execute function set_updated_at();
create trigger trg_jobs_updated_at before update on jobs
  for each row execute function set_updated_at();
create trigger trg_candidates_updated_at before update on candidates
  for each row execute function set_updated_at();
create trigger trg_applications_updated_at before update on applications
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security: company-level data isolation
-- ---------------------------------------------------------------------------
alter table companies enable row level security;
alter table users enable row level security;
alter table jobs enable row level security;
alter table candidates enable row level security;
alter table applications enable row level security;
alter table stage_history enable row level security;

-- helper: resolve the calling user's company_id
create or replace function current_company_id()
returns uuid as $$
  select company_id from users where id = auth.uid();
$$ language sql stable security definer;

create policy "Users can view their own company" on companies
  for select using (id = current_company_id());

create policy "Users can view teammates in their company" on users
  for select using (company_id = current_company_id());
create policy "Users can update their own profile" on users
  for update using (id = auth.uid());

create policy "Users can view their company's jobs" on jobs
  for select using (company_id = current_company_id());
create policy "Users can manage their company's jobs" on jobs
  for insert with check (company_id = current_company_id());
create policy "Users can update their company's jobs" on jobs
  for update using (company_id = current_company_id());
create policy "Users can delete their company's jobs" on jobs
  for delete using (company_id = current_company_id());

-- candidates are global profiles, readable/writable by any authenticated
-- recruiter (a candidate may apply across multiple companies' jobs)
create policy "Authenticated users can view candidates" on candidates
  for select using (auth.uid() is not null);
create policy "Authenticated users can create candidates" on candidates
  for insert with check (auth.uid() is not null);
create policy "Authenticated users can update candidates" on candidates
  for update using (auth.uid() is not null);

-- applications are scoped to the company that owns the associated job
create policy "Users can view applications for their company's jobs" on applications
  for select using (
    job_id in (select id from jobs where company_id = current_company_id())
  );
create policy "Users can create applications for their company's jobs" on applications
  for insert with check (
    job_id in (select id from jobs where company_id = current_company_id())
  );
create policy "Users can update applications for their company's jobs" on applications
  for update using (
    job_id in (select id from jobs where company_id = current_company_id())
  );

create policy "Users can view stage history for their company's applications" on stage_history
  for select using (
    application_id in (
      select a.id from applications a
      join jobs j on j.id = a.job_id
      where j.company_id = current_company_id()
    )
  );
create policy "Users can insert stage history for their company's applications" on stage_history
  for insert with check (
    application_id in (
      select a.id from applications a
      join jobs j on j.id = a.job_id
      where j.company_id = current_company_id()
    )
  );


-- ============================================================
-- 0002_phase2_jd.sql
-- ============================================================
-- Phase 2: structured JD fields on jobs + job_jd_versions history table.
-- Additive only — no existing Phase 1 columns are dropped or renamed.

-- ---------------------------------------------------------------------------
-- jobs: structured JD fields
-- ---------------------------------------------------------------------------
alter table jobs
  add column if not exists responsibilities text[] not null default '{}',
  add column if not exists required_skills text[] not null default '{}',
  add column if not exists preferred_skills text[] not null default '{}',
  add column if not exists education text,
  add column if not exists work_mode text check (work_mode in ('remote', 'hybrid', 'onsite') or work_mode is null),
  add column if not exists salary_range text,
  add column if not exists number_of_openings int not null default 1,
  add column if not exists screening_criteria jsonb,
  add column if not exists jd_status text not null default 'DRAFT'
    check (jd_status in ('DRAFT', 'GENERATING', 'READY_FOR_REVIEW', 'APPROVED'));

create index if not exists idx_jobs_jd_status on jobs (jd_status);

-- ---------------------------------------------------------------------------
-- job_jd_versions: append-only history of every generated/edited/approved JD
-- ---------------------------------------------------------------------------
create table if not exists job_jd_versions (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs (id) on delete cascade,
  version_number int not null,
  title text not null,
  description text not null default '',
  responsibilities text[] not null default '{}',
  required_skills text[] not null default '{}',
  preferred_skills text[] not null default '{}',
  screening_criteria jsonb,
  is_approved boolean not null default false,
  created_by uuid references users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (job_id, version_number)
);

create index if not exists idx_job_jd_versions_job_id on job_jd_versions (job_id);

-- only one approved version per job
create unique index if not exists idx_job_jd_versions_one_approved
  on job_jd_versions (job_id)
  where is_approved;

-- ---------------------------------------------------------------------------
-- RLS: same company-scoping as jobs itself
-- ---------------------------------------------------------------------------
alter table job_jd_versions enable row level security;

create policy "Users can view JD versions for their company's jobs" on job_jd_versions
  for select using (
    job_id in (select id from jobs where company_id = current_company_id())
  );
create policy "Users can create JD versions for their company's jobs" on job_jd_versions
  for insert with check (
    job_id in (select id from jobs where company_id = current_company_id())
  );
create policy "Users can update JD versions for their company's jobs" on job_jd_versions
  for update using (
    job_id in (select id from jobs where company_id = current_company_id())
  );


-- ============================================================
-- 0003_phase3_job_boards.sql
-- ============================================================
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


-- ============================================================
-- 0004_phase4_screening.sql
-- ============================================================
-- Phase 4: AI candidate screening, scoring, and shortlisting.
-- Additive only, with one exception: applications.current_stage's check
-- constraint is widened to allow the new NEEDS_REVIEW value (no existing
-- rows are invalidated — only a new allowed value is added).

-- ---------------------------------------------------------------------------
-- agent_runs: generic AI-agent execution ledger. agent_type is scoped to
-- 'SCREENING' for now; future agents (Phase 5+) extend the allowed list in
-- their own migration rather than redefining this table.
-- ---------------------------------------------------------------------------
create table if not exists agent_runs (
  id uuid primary key default gen_random_uuid(),
  agent_type text not null check (agent_type in ('SCREENING')),
  application_id uuid not null references applications (id) on delete cascade,
  status text not null default 'QUEUED'
    check (status in ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'NEEDS_REVIEW')),
  model text,
  started_at timestamptz,
  completed_at timestamptz,
  error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_agent_runs_application_id on agent_runs (application_id);
create index if not exists idx_agent_runs_agent_type_status on agent_runs (agent_type, status);

-- ---------------------------------------------------------------------------
-- screenings: versioned screening results, one job's application can be
-- screened more than once (JD changes, re-screen requests) — old rows are
-- never overwritten, only superseded via is_latest.
-- ---------------------------------------------------------------------------
create table if not exists screenings (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references applications (id) on delete cascade,
  agent_run_id uuid references agent_runs (id) on delete set null,
  jd_version_id uuid references job_jd_versions (id) on delete set null,
  screening_version int not null,
  status text not null default 'COMPLETED' check (status in ('COMPLETED', 'FAILED')),
  overall_score int check (overall_score is null or (overall_score >= 0 and overall_score <= 100)),
  recommendation text check (recommendation in ('SHORTLISTED', 'REJECTED', 'NEEDS_REVIEW')),
  confidence text check (confidence in ('HIGH', 'MEDIUM', 'LOW')),
  summary text,
  strengths text[] not null default '{}',
  gaps text[] not null default '{}',
  concerns text[] not null default '{}',
  component_scores jsonb not null default '{}'::jsonb,
  scoring_weights jsonb not null default '{}'::jsonb,
  is_latest boolean not null default true,
  model_name text,
  model_version text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (application_id, screening_version)
);

create index if not exists idx_screenings_application_id on screenings (application_id);

-- only one "latest" screening per application
create unique index if not exists idx_screenings_one_latest
  on screenings (application_id)
  where is_latest;

-- ---------------------------------------------------------------------------
-- screening_requirements: per-requirement match evidence, child of screenings.
-- ---------------------------------------------------------------------------
create table if not exists screening_requirements (
  id uuid primary key default gen_random_uuid(),
  screening_id uuid not null references screenings (id) on delete cascade,
  requirement_type text not null check (requirement_type in ('MANDATORY', 'PREFERRED')),
  requirement text not null,
  status text not null check (status in ('MATCH', 'NO_MATCH', 'UNKNOWN')),
  score int check (score is null or (score >= 0 and score <= 100)),
  evidence text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_screening_requirements_screening_id on screening_requirements (screening_id);

-- ---------------------------------------------------------------------------
-- applications.current_stage: widen the check constraint to allow
-- NEEDS_REVIEW (see lib/stages.ts for the single source of truth this
-- mirrors). Only adds an allowed value — no existing rows are affected.
-- ---------------------------------------------------------------------------
alter table applications drop constraint applications_current_stage_check;
alter table applications add constraint applications_current_stage_check check (current_stage in (
  'APPLIED', 'AI_SCREENING', 'NEEDS_REVIEW', 'SHORTLISTED', 'SKILL_VERIFICATION', 'AI_INTERVIEW',
  'INTERVIEW_SHORTLISTED', 'ASSESSMENT_SENT', 'ASSESSMENT_SUBMITTED', 'ASSESSMENT_EVALUATED',
  'FINAL_SHORTLISTED', 'INTERVIEW_SCHEDULED', 'FINAL_INTERVIEW', 'SELECTED', 'REJECTED'
));

-- ---------------------------------------------------------------------------
-- updated_at trigger (reuses set_updated_at() from 0001_init.sql)
-- ---------------------------------------------------------------------------
create trigger trg_screenings_updated_at before update on screenings
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table agent_runs enable row level security;
alter table screenings enable row level security;
alter table screening_requirements enable row level security;

-- agent_runs: two-hop through applications -> jobs, same pattern as stage_history
create policy "Users can view agent runs for their company's applications" on agent_runs
  for select using (
    application_id in (
      select a.id from applications a
      join jobs j on j.id = a.job_id
      where j.company_id = current_company_id()
    )
  );
create policy "Users can create agent runs for their company's applications" on agent_runs
  for insert with check (
    application_id in (
      select a.id from applications a
      join jobs j on j.id = a.job_id
      where j.company_id = current_company_id()
    )
  );
create policy "Users can update agent runs for their company's applications" on agent_runs
  for update using (
    application_id in (
      select a.id from applications a
      join jobs j on j.id = a.job_id
      where j.company_id = current_company_id()
    )
  );

-- screenings: same two-hop pattern
create policy "Users can view screenings for their company's applications" on screenings
  for select using (
    application_id in (
      select a.id from applications a
      join jobs j on j.id = a.job_id
      where j.company_id = current_company_id()
    )
  );
create policy "Users can create screenings for their company's applications" on screenings
  for insert with check (
    application_id in (
      select a.id from applications a
      join jobs j on j.id = a.job_id
      where j.company_id = current_company_id()
    )
  );
create policy "Users can update screenings for their company's applications" on screenings
  for update using (
    application_id in (
      select a.id from applications a
      join jobs j on j.id = a.job_id
      where j.company_id = current_company_id()
    )
  );

-- screening_requirements: three-hop through screenings -> applications -> jobs
create policy "Users can view screening requirements for their company's screenings" on screening_requirements
  for select using (
    screening_id in (
      select s.id from screenings s
      join applications a on a.id = s.application_id
      join jobs j on j.id = a.job_id
      where j.company_id = current_company_id()
    )
  );
create policy "Users can create screening requirements for their company's screenings" on screening_requirements
  for insert with check (
    screening_id in (
      select s.id from screenings s
      join applications a on a.id = s.application_id
      join jobs j on j.id = a.job_id
      where j.company_id = current_company_id()
    )
  );


-- ============================================================
-- 0005_phase5_interviews.sql
-- ============================================================
-- Phase 5: AI voice interview agent.
-- Additive only, with one exception: agent_runs.agent_type's check
-- constraint is widened to allow the new 'INTERVIEW' value (no existing
-- rows are invalidated — only a new allowed value is added), exactly the
-- way 0004 widened applications.current_stage for NEEDS_REVIEW.

-- ---------------------------------------------------------------------------
-- agent_runs: widen agent_type to include INTERVIEW.
-- ---------------------------------------------------------------------------
alter table agent_runs drop constraint agent_runs_agent_type_check;
alter table agent_runs add constraint agent_runs_agent_type_check
  check (agent_type in ('SCREENING', 'INTERVIEW'));

-- ---------------------------------------------------------------------------
-- interviews: versioned interview results, one application can be
-- interviewed more than once (retry, re-interview) — old rows are never
-- overwritten, only superseded via is_latest. `status` tracks the CALL
-- lifecycle (distinct from agent_runs.status, which tracks the agent
-- invocation lifecycle).
-- ---------------------------------------------------------------------------
create table if not exists interviews (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references applications (id) on delete cascade,
  agent_run_id uuid references agent_runs (id) on delete set null,
  jd_version_id uuid references job_jd_versions (id) on delete set null,
  screening_version_id uuid references screenings (id) on delete set null,
  interview_version int not null,
  status text not null default 'QUEUED' check (status in (
    'QUEUED', 'DIALING', 'IN_PROGRESS', 'COMPLETED', 'NO_ANSWER', 'BUSY',
    'CALL_FAILED', 'NETWORK_ERROR', 'PROVIDER_ERROR', 'CANDIDATE_DISCONNECTED',
    'CONSENT_DECLINED', 'NEEDS_REVIEW'
  )),
  provider text not null check (provider in ('mock', 'twilio')),
  external_call_id text,
  attempt_number int not null default 1,
  max_attempts int not null default 3,
  consent_status text not null default 'PENDING' check (consent_status in ('PENDING', 'GRANTED', 'DECLINED')),
  started_at timestamptz,
  ended_at timestamptz,
  duration_seconds int,
  overall_score numeric check (overall_score is null or (overall_score >= 0 and overall_score <= 100)),
  recommendation text check (recommendation in ('INTERVIEW_SHORTLISTED', 'REJECTED', 'NEEDS_REVIEW')),
  confidence text check (confidence in ('HIGH', 'MEDIUM', 'LOW')),
  summary text,
  strengths jsonb not null default '[]'::jsonb,
  gaps jsonb not null default '[]'::jsonb,
  concerns jsonb not null default '[]'::jsonb,
  component_scores jsonb not null default '{}'::jsonb,
  scoring_weights jsonb not null default '{}'::jsonb,
  is_latest boolean not null default true,
  model_name text,
  model_version text,
  recording_enabled boolean not null default false,
  recording_url text,
  recording_provider text,
  retention_policy text,
  current_section text,
  current_question_index int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (application_id, interview_version)
);

create index if not exists idx_interviews_application_id on interviews (application_id);
create index if not exists idx_interviews_status on interviews (status);
create index if not exists idx_interviews_external_call_id on interviews (external_call_id);

-- only one "latest" interview per application
create unique index if not exists idx_interviews_one_latest
  on interviews (application_id)
  where is_latest;

-- ---------------------------------------------------------------------------
-- interview_questions: planned + follow-up questions, child of interviews.
-- ---------------------------------------------------------------------------
create table if not exists interview_questions (
  id uuid primary key default gen_random_uuid(),
  interview_id uuid not null references interviews (id) on delete cascade,
  sequence int not null,
  section text not null,
  category text,
  question text not null,
  question_type text not null default 'PRIMARY' check (question_type in ('PRIMARY', 'FOLLOWUP')),
  parent_question_id uuid references interview_questions (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_interview_questions_interview_id on interview_questions (interview_id, sequence);

-- ---------------------------------------------------------------------------
-- interview_answers: one row per candidate answer, child of interviews.
-- The full transcript is reconstructed by joining interview_questions
-- (AI turn) + interview_answers (candidate turn) ordered by sequence —
-- no separate transcript blob table.
-- ---------------------------------------------------------------------------
create table if not exists interview_answers (
  id uuid primary key default gen_random_uuid(),
  interview_id uuid not null references interviews (id) on delete cascade,
  question_id uuid not null references interview_questions (id) on delete cascade,
  transcript text not null,
  duration_seconds int,
  relevance_score numeric check (relevance_score is null or (relevance_score >= 0 and relevance_score <= 100)),
  technical_score numeric check (technical_score is null or (technical_score >= 0 and technical_score <= 100)),
  clarity_score numeric check (clarity_score is null or (clarity_score >= 0 and clarity_score <= 100)),
  evidence_quality text,
  sufficiency text check (sufficiency in ('SUFFICIENT', 'PARTIAL', 'INSUFFICIENT')),
  evaluation text,
  created_at timestamptz not null default now()
);

create index if not exists idx_interview_answers_interview_id on interview_answers (interview_id);
create index if not exists idx_interview_answers_question_id on interview_answers (question_id);

-- ---------------------------------------------------------------------------
-- interview_events: audit trail, child of interviews.
-- ---------------------------------------------------------------------------
create table if not exists interview_events (
  id uuid primary key default gen_random_uuid(),
  interview_id uuid not null references interviews (id) on delete cascade,
  event_type text not null check (event_type in (
    'CALL_STARTED', 'AI_INTRO', 'CONSENT_RECEIVED', 'CONSENT_DECLINED', 'QUESTION_ASKED',
    'ANSWER_RECEIVED', 'FOLLOWUP_GENERATED', 'SECTION_COMPLETED', 'CALL_ENDED',
    'EVALUATION_COMPLETED', 'CALL_FAILED', 'HUMAN_OVERRIDE'
  )),
  event_timestamp timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_interview_events_interview_id on interview_events (interview_id, event_timestamp);

-- ---------------------------------------------------------------------------
-- updated_at trigger (reuses set_updated_at() from 0001_init.sql)
-- ---------------------------------------------------------------------------
create trigger trg_interviews_updated_at before update on interviews
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table interviews enable row level security;
alter table interview_questions enable row level security;
alter table interview_answers enable row level security;
alter table interview_events enable row level security;

-- interviews: two-hop through applications -> jobs, same pattern as screenings
create policy "Users can view interviews for their company's applications" on interviews
  for select using (
    application_id in (
      select a.id from applications a
      join jobs j on j.id = a.job_id
      where j.company_id = current_company_id()
    )
  );
create policy "Users can create interviews for their company's applications" on interviews
  for insert with check (
    application_id in (
      select a.id from applications a
      join jobs j on j.id = a.job_id
      where j.company_id = current_company_id()
    )
  );
create policy "Users can update interviews for their company's applications" on interviews
  for update using (
    application_id in (
      select a.id from applications a
      join jobs j on j.id = a.job_id
      where j.company_id = current_company_id()
    )
  );

-- interview_questions: three-hop through interviews -> applications -> jobs
create policy "Users can view interview questions for their company's interviews" on interview_questions
  for select using (
    interview_id in (
      select i.id from interviews i
      join applications a on a.id = i.application_id
      join jobs j on j.id = a.job_id
      where j.company_id = current_company_id()
    )
  );
create policy "Users can create interview questions for their company's interviews" on interview_questions
  for insert with check (
    interview_id in (
      select i.id from interviews i
      join applications a on a.id = i.application_id
      join jobs j on j.id = a.job_id
      where j.company_id = current_company_id()
    )
  );

-- interview_answers: same three-hop pattern
create policy "Users can view interview answers for their company's interviews" on interview_answers
  for select using (
    interview_id in (
      select i.id from interviews i
      join applications a on a.id = i.application_id
      join jobs j on j.id = a.job_id
      where j.company_id = current_company_id()
    )
  );
create policy "Users can create interview answers for their company's interviews" on interview_answers
  for insert with check (
    interview_id in (
      select i.id from interviews i
      join applications a on a.id = i.application_id
      join jobs j on j.id = a.job_id
      where j.company_id = current_company_id()
    )
  );

-- interview_events: same three-hop pattern
create policy "Users can view interview events for their company's interviews" on interview_events
  for select using (
    interview_id in (
      select i.id from interviews i
      join applications a on a.id = i.application_id
      join jobs j on j.id = a.job_id
      where j.company_id = current_company_id()
    )
  );
create policy "Users can create interview events for their company's interviews" on interview_events
  for insert with check (
    interview_id in (
      select i.id from interviews i
      join applications a on a.id = i.application_id
      join jobs j on j.id = a.job_id
      where j.company_id = current_company_id()
    )
  );


-- ============================================================
-- 0006_phase6_assessments.sql
-- ============================================================
-- Phase 6: AI assessment agent + automated assessment evaluation.
-- Additive only, with two exceptions (same drop/recreate pattern as
-- 0004/0005): agent_runs.agent_type is widened for the two new assessment
-- agent runs, and candidates gets a nullable auth_user_id column for the
-- candidate-facing portal's Supabase-auth login (no candidate login existed
-- before this phase — Phase 5's interview was phone-only).

-- ---------------------------------------------------------------------------
-- agent_runs: widen agent_type to include the two assessment agent runs.
-- ASSESSMENT_GENERATION is job-level (an assessment isn't tied to one
-- application), unlike every prior agent type — so application_id becomes
-- nullable and a job_id column is added, with a check that exactly one of
-- the two is set depending on the run's scope.
-- ---------------------------------------------------------------------------
alter table agent_runs drop constraint agent_runs_agent_type_check;
alter table agent_runs add constraint agent_runs_agent_type_check
  check (agent_type in ('SCREENING', 'INTERVIEW', 'ASSESSMENT_GENERATION', 'ASSESSMENT_EVALUATION'));

alter table agent_runs alter column application_id drop not null;
alter table agent_runs add column if not exists job_id uuid references jobs (id) on delete cascade;
alter table agent_runs add constraint agent_runs_scope_check
  check ((application_id is not null) or (job_id is not null));

create index if not exists idx_agent_runs_job_id on agent_runs (job_id);

-- agent_runs: additional policies for job-scoped rows (application_id null,
-- job_id set) — the 0004 policies only match rows with an application_id.
create policy "Users can view job-scoped agent runs for their company's jobs" on agent_runs
  for select using (job_id in (select id from jobs where company_id = current_company_id()));
create policy "Users can create job-scoped agent runs for their company's jobs" on agent_runs
  for insert with check (job_id in (select id from jobs where company_id = current_company_id()));
create policy "Users can update job-scoped agent runs for their company's jobs" on agent_runs
  for update using (job_id in (select id from jobs where company_id = current_company_id()));

-- ---------------------------------------------------------------------------
-- candidates: link to auth.users for the candidate-facing assessment portal.
--
-- IMPORTANT: 0001_init.sql's candidates policies ("Authenticated users can
-- view/create/update candidates") were written back when only recruiters
-- ever held a Supabase-auth session. Now that candidates get one too (magic
-- link), those policies would let any candidate read/write every other
-- candidate's profile — replace them with recruiter-only checks (via the
-- `users` table) plus a narrow "own row" policy for candidates.
-- ---------------------------------------------------------------------------
alter table candidates add column if not exists auth_user_id uuid unique references auth.users (id);

drop policy "Authenticated users can view candidates" on candidates;
drop policy "Authenticated users can create candidates" on candidates;
drop policy "Authenticated users can update candidates" on candidates;

create policy "Recruiters can view candidates" on candidates
  for select using (exists (select 1 from users where id = auth.uid()));
create policy "Recruiters can create candidates" on candidates
  for insert with check (exists (select 1 from users where id = auth.uid()));
create policy "Recruiters can update candidates" on candidates
  for update using (exists (select 1 from users where id = auth.uid()));

create policy "Candidates can view their own profile" on candidates
  for select using (auth_user_id = auth.uid());
-- The "claim" policy that lets linkCandidateAuth() set auth_user_id on a
-- still-unlinked row is created further below, after assessment_assignments
-- exists — it needs to reference that table to require the candidate
-- already has an assignment before their profile can be claimed.

-- ---------------------------------------------------------------------------
-- assessments: versioned job-specific assessment definitions. Job-level, not
-- application-level — one job has (at most) one "latest" assessment that
-- gets assigned to many applications. Editing after assignments exist
-- creates a new version rather than mutating an active assignment's content
-- out from under it (see lib/services/assessments.ts).
-- ---------------------------------------------------------------------------
create table if not exists assessments (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs (id) on delete cascade,
  created_by uuid references users (id) on delete set null,
  title text not null,
  description text not null default '',
  instructions text not null default '',
  type text not null check (type in (
    'TECHNICAL', 'CODING', 'CASE_STUDY', 'WRITTEN', 'MCQ', 'SCENARIO', 'ROLE_SPECIFIC', 'CUSTOM'
  )),
  duration_minutes int check (duration_minutes is null or duration_minutes > 0),
  passing_score numeric not null default 70 check (passing_score >= 0 and passing_score <= 100),
  status text not null default 'DRAFT' check (status in (
    'DRAFT', 'READY', 'SENT', 'IN_PROGRESS', 'SUBMITTED', 'EVALUATING', 'EVALUATED', 'EXPIRED', 'CANCELLED'
  )),
  assessment_version int not null,
  is_latest boolean not null default true,
  deadline_unit text not null default 'DAYS' check (deadline_unit in ('HOURS', 'DAYS')),
  deadline_value int not null default 3 check (deadline_value > 0),
  auto_submit_on_expiry boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (job_id, assessment_version)
);

create index if not exists idx_assessments_job_id on assessments (job_id);

-- only one "latest" assessment per job
create unique index if not exists idx_assessments_one_latest
  on assessments (job_id)
  where is_latest;

-- ---------------------------------------------------------------------------
-- assessment_questions: child of assessments. expected_answer and
-- evaluation_criteria are the "answer key" and must never be exposed to
-- candidates — see the assessment_questions_public view below, which is
-- the only thing candidate-facing code is allowed to query.
-- ---------------------------------------------------------------------------
create table if not exists assessment_questions (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references assessments (id) on delete cascade,
  sequence int not null,
  type text not null check (type in ('MCQ', 'SHORT_ANSWER', 'LONG_ANSWER', 'CODING', 'CASE_STUDY', 'FILE_UPLOAD')),
  question text not null,
  instructions text,
  points numeric not null check (points > 0),
  difficulty text not null default 'MEDIUM' check (difficulty in ('EASY', 'MEDIUM', 'HARD')),
  options jsonb,
  expected_answer text,
  evaluation_criteria text,
  created_at timestamptz not null default now(),
  unique (assessment_id, sequence)
);

create index if not exists idx_assessment_questions_assessment_id on assessment_questions (assessment_id, sequence);

-- ---------------------------------------------------------------------------
-- assessment_assignments: one candidate's attempt at an assessment version,
-- child of applications (mirrors interviews' relationship to applications).
-- ---------------------------------------------------------------------------
create table if not exists assessment_assignments (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references assessments (id) on delete cascade,
  application_id uuid not null references applications (id) on delete cascade,
  candidate_id uuid not null references candidates (id) on delete cascade,
  status text not null default 'ASSIGNED' check (status in (
    'ASSIGNED', 'STARTED', 'SUBMITTED', 'EVALUATING', 'COMPLETED', 'EXPIRED', 'CANCELLED'
  )),
  assigned_at timestamptz not null default now(),
  started_at timestamptz,
  submitted_at timestamptz,
  deadline timestamptz not null,
  score numeric check (score is null or (score >= 0 and score <= 100)),
  recommendation text check (recommendation in ('SHORTLIST', 'REJECT', 'NEEDS_REVIEW')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (assessment_id, application_id)
);

create index if not exists idx_assessment_assignments_application_id on assessment_assignments (application_id);
create index if not exists idx_assessment_assignments_candidate_id on assessment_assignments (candidate_id);
create index if not exists idx_assessment_assignments_status_deadline on assessment_assignments (status, deadline);

-- security definer so it can be used inside a `candidates` RLS predicate for
-- a not-yet-linked candidate — at that point candidate_id_for_auth() is
-- null and ordinary assessment_assignments RLS wouldn't yet grant the
-- caller visibility into their own (pre-link) assignment row.
create or replace function candidate_has_assignment(check_candidate_id uuid)
returns boolean as $$
  select exists (select 1 from assessment_assignments where candidate_id = check_candidate_id);
$$ language sql stable security definer;

-- Intentionally no general candidate-facing update policy on candidates
-- itself — linking auth_user_id happens once via linkCandidateAuth(), via a
-- dedicated, narrowly-scoped claim policy: a still-unlinked row may be
-- claimed by the authenticated user whose email matches, and ONLY if that
-- candidate already has an assessment assignment — defense in depth
-- alongside linkCandidateAuth()'s own app-layer check, so an arbitrary
-- signup can never claim a candidate profile that was never sent one.
create policy "Unlinked candidates can be found by a matching authenticated email" on candidates
  for select using (
    auth_user_id is null
    and lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    and candidate_has_assignment(candidates.id)
  );
create policy "Unlinked candidates can be claimed by a matching authenticated email" on candidates
  for update using (
    auth_user_id is null
    and lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    and candidate_has_assignment(candidates.id)
  );

-- ---------------------------------------------------------------------------
-- assessment_answers: one row per question, upserted on every autosave.
-- Server-side persistence per spec §9 — never relies on client state.
-- ---------------------------------------------------------------------------
create table if not exists assessment_answers (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references assessment_assignments (id) on delete cascade,
  question_id uuid not null references assessment_questions (id) on delete cascade,
  answer_text text,
  selected_option text,
  code text,
  file_url text,
  auto_saved_at timestamptz not null default now(),
  submitted_at timestamptz,
  unique (assignment_id, question_id)
);

create index if not exists idx_assessment_answers_assignment_id on assessment_answers (assignment_id);

-- ---------------------------------------------------------------------------
-- assessment_question_evaluations: one row per question per assignment,
-- written by the evaluation agent question-by-question (never a blind final
-- score — see lib/assessment/evaluation-agent.ts).
-- ---------------------------------------------------------------------------
create table if not exists assessment_question_evaluations (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references assessment_assignments (id) on delete cascade,
  question_id uuid not null references assessment_questions (id) on delete cascade,
  score numeric not null check (score >= 0),
  max_score numeric not null check (max_score > 0),
  evaluation text not null,
  evidence text,
  confidence text not null check (confidence in ('HIGH', 'MEDIUM', 'LOW')),
  created_at timestamptz not null default now(),
  unique (assignment_id, question_id)
);

create index if not exists idx_assessment_question_evaluations_assignment_id on assessment_question_evaluations (assignment_id);

-- ---------------------------------------------------------------------------
-- assessment_events: audit trail / configurable integrity signals (spec
-- §18) — submission timestamps, answer-change history, session activity.
-- Read-only signal surfaced to recruiters; never used to auto-reject.
-- ---------------------------------------------------------------------------
create table if not exists assessment_events (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references assessment_assignments (id) on delete cascade,
  event_type text not null check (event_type in (
    'SESSION_OPENED', 'STARTED', 'ANSWER_SAVED', 'ANSWER_CHANGED', 'SECTION_VIEWED',
    'SUBMITTED', 'AUTO_SUBMITTED', 'EXPIRED', 'EVALUATION_COMPLETED', 'HUMAN_OVERRIDE'
  )),
  event_timestamp timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_assessment_events_assignment_id on assessment_events (assignment_id, event_timestamp);

-- ---------------------------------------------------------------------------
-- updated_at triggers (reuses set_updated_at() from 0001_init.sql)
-- ---------------------------------------------------------------------------
create trigger trg_assessments_updated_at before update on assessments
  for each row execute function set_updated_at();
create trigger trg_assessment_assignments_updated_at before update on assessment_assignments
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table assessments enable row level security;
alter table assessment_questions enable row level security;
alter table assessment_assignments enable row level security;
alter table assessment_answers enable row level security;
alter table assessment_question_evaluations enable row level security;
alter table assessment_events enable row level security;

-- helper: resolve the calling candidate's id from their linked auth user,
-- mirrors current_company_id()'s shape for recruiters.
create or replace function candidate_id_for_auth()
returns uuid as $$
  select id from candidates where auth_user_id = auth.uid();
$$ language sql stable security definer;

-- assessments: recruiter policies, one-hop through jobs.
create policy "Users can view assessments for their company's jobs" on assessments
  for select using (job_id in (select id from jobs where company_id = current_company_id()));
create policy "Users can create assessments for their company's jobs" on assessments
  for insert with check (job_id in (select id from jobs where company_id = current_company_id()));
create policy "Users can update assessments for their company's jobs" on assessments
  for update using (job_id in (select id from jobs where company_id = current_company_id()));

-- assessments: candidate policy — only the assessment attached to one of
-- their own assignments. The candidate-facing app code still only ever
-- selects a safe column subset (title/description/instructions/type/
-- duration_minutes) — passing_score and status are recruiter-only info.
create policy "Candidates can view assessments for their own assignments" on assessments
  for select using (
    id in (select assessment_id from assessment_assignments where candidate_id = candidate_id_for_auth())
  );

-- assessment_questions: recruiter policies, two-hop through assessments -> jobs.
create policy "Users can view assessment questions for their company's assessments" on assessment_questions
  for select using (
    assessment_id in (select a.id from assessments a where a.job_id in (select id from jobs where company_id = current_company_id()))
  );
create policy "Users can create assessment questions for their company's assessments" on assessment_questions
  for insert with check (
    assessment_id in (select a.id from assessments a where a.job_id in (select id from jobs where company_id = current_company_id()))
  );
create policy "Users can update assessment questions for their company's assessments" on assessment_questions
  for update using (
    assessment_id in (select a.id from assessments a where a.job_id in (select id from jobs where company_id = current_company_id()))
  );
create policy "Users can delete assessment questions for their company's assessments" on assessment_questions
  for delete using (
    assessment_id in (select a.id from assessments a where a.job_id in (select id from jobs where company_id = current_company_id()))
  );

-- assessment_questions: candidate policy — rows for assessments they're
-- assigned to. Row-level only; column-level protection of expected_answer /
-- evaluation_criteria is enforced by candidate code exclusively using the
-- assessment_questions_public view below, never the base table.
create policy "Candidates can view questions for their own assignments" on assessment_questions
  for select using (
    assessment_id in (
      select assessment_id from assessment_assignments where candidate_id = candidate_id_for_auth()
    )
  );

-- Safe view for candidate-facing reads — excludes expected_answer and
-- evaluation_criteria entirely. security_invoker means it still runs under
-- the caller's own RLS on the base table (Postgres 15+/Supabase default).
create view assessment_questions_public
  with (security_invoker = true) as
  select id, assessment_id, sequence, type, question, instructions, points, difficulty, options
  from assessment_questions;

-- assessment_assignments: recruiter policies, two-hop through applications -> jobs.
create policy "Users can view assignments for their company's applications" on assessment_assignments
  for select using (
    application_id in (select a.id from applications a join jobs j on j.id = a.job_id where j.company_id = current_company_id())
  );
create policy "Users can create assignments for their company's applications" on assessment_assignments
  for insert with check (
    application_id in (select a.id from applications a join jobs j on j.id = a.job_id where j.company_id = current_company_id())
  );
create policy "Users can update assignments for their company's applications" on assessment_assignments
  for update using (
    application_id in (select a.id from applications a join jobs j on j.id = a.job_id where j.company_id = current_company_id())
  );

-- assessment_assignments: candidate policies — own row only. The service
-- layer (lib/services/assessments.ts) is the enforcement point that keeps
-- candidate-authenticated writes limited to status/started_at/submitted_at
-- — RLS alone cannot restrict which columns an UPDATE touches.
create policy "Candidates can view their own assignments" on assessment_assignments
  for select using (candidate_id = candidate_id_for_auth());
create policy "Candidates can update their own assignments" on assessment_assignments
  for update using (candidate_id = candidate_id_for_auth());

-- assessment_answers: recruiter policies, three-hop through assignments -> applications -> jobs.
create policy "Users can view answers for their company's assignments" on assessment_answers
  for select using (
    assignment_id in (
      select aa.id from assessment_assignments aa
      join applications a on a.id = aa.application_id
      join jobs j on j.id = a.job_id
      where j.company_id = current_company_id()
    )
  );

-- assessment_answers: candidate policies — own assignment only, full CRUD
-- needed for autosave (insert on first save, update on subsequent saves).
create policy "Candidates can view their own answers" on assessment_answers
  for select using (
    assignment_id in (select id from assessment_assignments where candidate_id = candidate_id_for_auth())
  );
create policy "Candidates can insert their own answers" on assessment_answers
  for insert with check (
    assignment_id in (select id from assessment_assignments where candidate_id = candidate_id_for_auth())
  );
create policy "Candidates can update their own answers" on assessment_answers
  for update using (
    assignment_id in (select id from assessment_assignments where candidate_id = candidate_id_for_auth())
  );

-- assessment_question_evaluations: recruiter-only (contains the answer key
-- comparison / evidence) — no candidate policy, this is never shown to
-- candidates.
create policy "Users can view evaluations for their company's assignments" on assessment_question_evaluations
  for select using (
    assignment_id in (
      select aa.id from assessment_assignments aa
      join applications a on a.id = aa.application_id
      join jobs j on j.id = a.job_id
      where j.company_id = current_company_id()
    )
  );
create policy "Users can create evaluations for their company's assignments" on assessment_question_evaluations
  for insert with check (
    assignment_id in (
      select aa.id from assessment_assignments aa
      join applications a on a.id = aa.application_id
      join jobs j on j.id = a.job_id
      where j.company_id = current_company_id()
    )
  );

-- assessment_events: recruiter view (integrity signals) + candidate insert
-- (client-observable events like SECTION_VIEWED) and view of their own.
create policy "Users can view events for their company's assignments" on assessment_events
  for select using (
    assignment_id in (
      select aa.id from assessment_assignments aa
      join applications a on a.id = aa.application_id
      join jobs j on j.id = a.job_id
      where j.company_id = current_company_id()
    )
  );
create policy "Users can create events for their company's assignments" on assessment_events
  for insert with check (
    assignment_id in (
      select aa.id from assessment_assignments aa
      join applications a on a.id = aa.application_id
      join jobs j on j.id = a.job_id
      where j.company_id = current_company_id()
    )
  );
create policy "Candidates can view events for their own assignments" on assessment_events
  for select using (
    assignment_id in (select id from assessment_assignments where candidate_id = candidate_id_for_auth())
  );
create policy "Candidates can create events for their own assignments" on assessment_events
  for insert with check (
    assignment_id in (select id from assessment_assignments where candidate_id = candidate_id_for_auth())
  );

-- ---------------------------------------------------------------------------
-- Storage: private bucket for FILE_UPLOAD question answers (spec §11/§27 —
-- secure uploads, signed URLs, no unauthorized exposure). Object paths are
-- namespaced `{assignment_id}/{question_id}/{filename}` — policies key off
-- the first path segment as the assignment id.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('assessment-uploads', 'assessment-uploads', false)
on conflict (id) do nothing;

create policy "Candidates can upload files for their own assignments" on storage.objects
  for insert with check (
    bucket_id = 'assessment-uploads'
    and (storage.foldername(name))[1]::uuid in (select id from assessment_assignments where candidate_id = candidate_id_for_auth())
  );
create policy "Candidates can view their own uploaded files" on storage.objects
  for select using (
    bucket_id = 'assessment-uploads'
    and (storage.foldername(name))[1]::uuid in (select id from assessment_assignments where candidate_id = candidate_id_for_auth())
  );
create policy "Recruiters can view uploaded files for their company's assignments" on storage.objects
  for select using (
    bucket_id = 'assessment-uploads'
    and (storage.foldername(name))[1]::uuid in (
      select aa.id from assessment_assignments aa
      join applications a on a.id = aa.application_id
      join jobs j on j.id = a.job_id
      where j.company_id = current_company_id()
    )
  );


-- ============================================================
-- 0007_phase7_communication.sql
-- ============================================================
-- Phase 7: Communication Agent + email automation + Google Calendar
-- scheduling agent. Additive only — no existing table/column is modified.
--
-- Naming note: Phase 5 already created a table named `interview_events`
-- (call-lifecycle audit log, child of `interviews`). This phase's calendar
-- bookings are a different entity entirely and are named
-- `scheduled_interviews` to avoid colliding with it.

-- ---------------------------------------------------------------------------
-- email_templates: versioned, reusable templates. Old sent emails stay tied
-- to the version they were rendered from (email_messages.template_version)
-- even after a template is edited — never retroactively reinterpreted.
-- ---------------------------------------------------------------------------
create table if not exists email_templates (
  id uuid primary key default gen_random_uuid(),
  template_name text not null check (template_name in (
    'ASSESSMENT_INVITATION', 'ASSESSMENT_REMINDER', 'ASSESSMENT_SUBMITTED',
    'INTERVIEW_INVITATION', 'INTERVIEW_RESCHEDULE', 'INTERVIEW_REMINDER',
    'NEXT_STEP', 'REJECTION', 'NEEDS_REVIEW', 'FINAL_SELECTION', 'OFFER_NEXT_STEP'
  )),
  version int not null,
  subject text not null,
  body text not null,
  variables jsonb not null default '[]'::jsonb,
  is_latest boolean not null default true,
  created_at timestamptz not null default now(),
  unique (template_name, version)
);

create unique index if not exists idx_email_templates_one_latest
  on email_templates (template_name)
  where is_latest;

-- ---------------------------------------------------------------------------
-- email_messages: every email the CommunicationAgent has attempted to send.
-- idempotency_key = `${application_id}:${event_type}:${template_version}`,
-- computed by the service layer — the unique constraint is what actually
-- prevents a duplicate send (a second insert attempt fails, the agent
-- treats that as "already sent" rather than sending again).
-- ---------------------------------------------------------------------------
create table if not exists email_messages (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  candidate_id uuid references candidates (id) on delete set null,
  application_id uuid references applications (id) on delete set null,
  template text not null,
  template_version int not null,
  event_type text not null,
  idempotency_key text not null unique,
  recipient text not null,
  subject text not null,
  body text not null,
  status text not null default 'QUEUED' check (status in (
    'QUEUED', 'SENDING', 'SENT', 'DELIVERED', 'FAILED', 'BOUNCED', 'CANCELLED'
  )),
  provider text,
  external_message_id text,
  sent_at timestamptz,
  delivered_at timestamptz,
  failed_at timestamptz,
  error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_email_messages_company_id on email_messages (company_id);
create index if not exists idx_email_messages_application_id on email_messages (application_id);
create index if not exists idx_email_messages_status on email_messages (status);

-- ---------------------------------------------------------------------------
-- interviewers: recruiter-managed profiles who conduct human interviews.
-- Distinct from `users` (which is recruiter/admin/hiring_manager login
-- accounts) — an interviewer may or may not also have a `users` row.
-- ---------------------------------------------------------------------------
create table if not exists interviewers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  user_id uuid references users (id) on delete set null,
  name text not null,
  email text not null,
  timezone text not null default 'UTC',
  calendar_provider text not null default 'google' check (calendar_provider in ('google')),
  calendar_id text,
  active boolean not null default true,
  interview_types text[] not null default '{}',
  working_hours jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_interviewers_company_id on interviewers (company_id);

-- ---------------------------------------------------------------------------
-- calendar_connections: one Google OAuth connection per interviewer (the
-- user-approved per-interviewer scoping — each interviewer authorizes their
-- own calendar rather than one company-wide grant). access_token/
-- refresh_token are secrets: same "never selected by a client-facing
-- service call" discipline as job_board_credentials.credentials — enforced
-- in lib/services/scheduling.ts, not by RLS (RLS only gates row visibility
-- by company, same as job_board_credentials).
-- ---------------------------------------------------------------------------
create table if not exists calendar_connections (
  id uuid primary key default gen_random_uuid(),
  interviewer_id uuid not null unique references interviewers (id) on delete cascade,
  company_id uuid not null references companies (id) on delete cascade,
  provider text not null default 'google' check (provider in ('google')),
  status text not null default 'not_connected' check (status in ('not_connected', 'connected', 'error')),
  access_token text,
  refresh_token text,
  token_expires_at timestamptz,
  scope text,
  connected_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- oauth_states: short-lived CSRF guard for the OAuth callback, consumed
-- (deleted) the moment it's validated.
-- ---------------------------------------------------------------------------
create table if not exists oauth_states (
  id uuid primary key default gen_random_uuid(),
  state text not null unique,
  interviewer_id uuid not null references interviewers (id) on delete cascade,
  company_id uuid not null references companies (id) on delete cascade,
  purpose text not null default 'google_calendar',
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- candidate_availability: recruiter-entered this phase (candidate
-- self-service link is explicitly deferred). Weekly-recurring preference,
-- not fixed dates — matches the spec's "Monday 10AM-4PM" example shape.
-- ---------------------------------------------------------------------------
create table if not exists candidate_availability (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references applications (id) on delete cascade,
  day_of_week int not null check (day_of_week between 0 and 6),
  start_time time not null,
  end_time time not null,
  timezone text not null default 'UTC',
  created_at timestamptz not null default now(),
  check (start_time < end_time)
);

create index if not exists idx_candidate_availability_application_id on candidate_availability (application_id);

-- ---------------------------------------------------------------------------
-- scheduled_interviews: a human-interview calendar booking. Reschedule
-- never mutates/deletes the prior row (spec §23) — it's marked RESCHEDULED
-- and a new row points back at it via rescheduled_from_id, preserving full
-- history.
-- ---------------------------------------------------------------------------
create table if not exists scheduled_interviews (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references applications (id) on delete cascade,
  candidate_id uuid not null references candidates (id) on delete cascade,
  interviewer_id uuid not null references interviewers (id) on delete cascade,
  interview_type text not null,
  provider text not null default 'google' check (provider in ('google')),
  external_event_id text,
  start_time timestamptz not null,
  end_time timestamptz not null,
  timezone text not null default 'UTC',
  status text not null default 'PROPOSED' check (status in (
    'PROPOSED', 'CONFIRMED', 'CANCELLED', 'COMPLETED', 'NO_SHOW', 'RESCHEDULED'
  )),
  meeting_url text,
  rescheduled_from_id uuid references scheduled_interviews (id) on delete set null,
  cancelled_by text check (cancelled_by is null or cancelled_by in ('CANDIDATE', 'INTERVIEWER', 'RECRUITER', 'SYSTEM')),
  cancellation_reason text,
  reminder_24h_sent_at timestamptz,
  reminder_2h_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (start_time < end_time)
);

create index if not exists idx_scheduled_interviews_application_id on scheduled_interviews (application_id);
create index if not exists idx_scheduled_interviews_interviewer_id on scheduled_interviews (interviewer_id, start_time);
create index if not exists idx_scheduled_interviews_status_start on scheduled_interviews (status, start_time);

-- ---------------------------------------------------------------------------
-- interview_slot_locks + acquire/release RPC: the real double-booking guard
-- (spec §12/§13). PostgREST can't run a multi-statement transaction from
-- the client, so the atomic "is this interviewer/interval already held"
-- check-and-insert happens inside a single SQL function instead.
-- ---------------------------------------------------------------------------
create table if not exists interview_slot_locks (
  id uuid primary key default gen_random_uuid(),
  interviewer_id uuid not null references interviewers (id) on delete cascade,
  start_time timestamptz not null,
  end_time timestamptz not null,
  status text not null default 'HELD' check (status in ('HELD', 'RELEASED')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_interview_slot_locks_interviewer_active
  on interview_slot_locks (interviewer_id, start_time, end_time)
  where status = 'HELD';

create or replace function acquire_scheduling_lock(
  p_interviewer_id uuid,
  p_start timestamptz,
  p_end timestamptz,
  p_ttl_seconds int default 60
)
returns uuid as $$
declare
  v_lock_id uuid;
begin
  -- Clear out any expired holds first so they don't block new attempts.
  update interview_slot_locks
    set status = 'RELEASED'
    where status = 'HELD' and expires_at < now();

  if exists (
    select 1 from interview_slot_locks
    where interviewer_id = p_interviewer_id
      and status = 'HELD'
      and start_time < p_end
      and end_time > p_start
  ) then
    return null;
  end if;

  insert into interview_slot_locks (interviewer_id, start_time, end_time, status, expires_at)
  values (p_interviewer_id, p_start, p_end, 'HELD', now() + make_interval(secs => p_ttl_seconds))
  returning id into v_lock_id;

  return v_lock_id;
end;
$$ language plpgsql security definer;

create or replace function release_scheduling_lock(p_lock_id uuid)
returns void as $$
  update interview_slot_locks set status = 'RELEASED' where id = p_lock_id;
$$ language sql security definer;

-- ---------------------------------------------------------------------------
-- automation_rules: per-company ON/OFF switches (spec §30). Absence of a
-- row for a given rule_key is treated as enabled-by-default by the service
-- layer — this table only needs to store explicit overrides.
-- ---------------------------------------------------------------------------
create table if not exists automation_rules (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  rule_key text not null check (rule_key in (
    'auto_send_assessment_email', 'auto_send_assessment_reminder',
    'auto_schedule_interview', 'auto_send_interview_reminders', 'auto_notify_interviewer',
    'auto_send_status_emails'
  )),
  enabled boolean not null default true,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, rule_key)
);

-- ---------------------------------------------------------------------------
-- updated_at triggers (reuses set_updated_at() from 0001_init.sql)
-- ---------------------------------------------------------------------------
create trigger trg_email_messages_updated_at before update on email_messages
  for each row execute function set_updated_at();
create trigger trg_interviewers_updated_at before update on interviewers
  for each row execute function set_updated_at();
create trigger trg_calendar_connections_updated_at before update on calendar_connections
  for each row execute function set_updated_at();
create trigger trg_scheduled_interviews_updated_at before update on scheduled_interviews
  for each row execute function set_updated_at();
create trigger trg_automation_rules_updated_at before update on automation_rules
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table email_templates enable row level security;
alter table email_messages enable row level security;
alter table interviewers enable row level security;
alter table calendar_connections enable row level security;
alter table oauth_states enable row level security;
alter table candidate_availability enable row level security;
alter table scheduled_interviews enable row level security;
alter table interview_slot_locks enable row level security;
alter table automation_rules enable row level security;

-- email_templates: global read for any authenticated recruiter (not
-- company-scoped — templates aren't per-company content, same as how
-- `agent_runs.agent_type` values are shared vocabulary, not tenant data).
create policy "Authenticated users can view email templates" on email_templates
  for select using (auth.uid() is not null);

-- email_messages: company-scoped, one hop.
create policy "Users can view their company's email messages" on email_messages
  for select using (company_id = current_company_id());
create policy "Users can create their company's email messages" on email_messages
  for insert with check (company_id = current_company_id());
create policy "Users can update their company's email messages" on email_messages
  for update using (company_id = current_company_id());

-- interviewers: company-scoped.
create policy "Users can view their company's interviewers" on interviewers
  for select using (company_id = current_company_id());
create policy "Users can create their company's interviewers" on interviewers
  for insert with check (company_id = current_company_id());
create policy "Users can update their company's interviewers" on interviewers
  for update using (company_id = current_company_id());

-- calendar_connections: company-scoped. RLS gates row visibility only —
-- the secrets-column omission discipline is enforced in the service layer.
create policy "Users can view their company's calendar connections" on calendar_connections
  for select using (company_id = current_company_id());
create policy "Users can create their company's calendar connections" on calendar_connections
  for insert with check (company_id = current_company_id());
create policy "Users can update their company's calendar connections" on calendar_connections
  for update using (company_id = current_company_id());

-- oauth_states: company-scoped; only ever written/read by the OAuth
-- start/callback routes under an authenticated recruiter session.
create policy "Users can view their company's oauth states" on oauth_states
  for select using (company_id = current_company_id());
create policy "Users can create their company's oauth states" on oauth_states
  for insert with check (company_id = current_company_id());
create policy "Users can delete their company's oauth states" on oauth_states
  for delete using (company_id = current_company_id());

-- candidate_availability: company-scoped via application -> job.
create policy "Users can view candidate availability for their company's applications" on candidate_availability
  for select using (
    application_id in (select a.id from applications a join jobs j on j.id = a.job_id where j.company_id = current_company_id())
  );
create policy "Users can create candidate availability for their company's applications" on candidate_availability
  for insert with check (
    application_id in (select a.id from applications a join jobs j on j.id = a.job_id where j.company_id = current_company_id())
  );
create policy "Users can delete candidate availability for their company's applications" on candidate_availability
  for delete using (
    application_id in (select a.id from applications a join jobs j on j.id = a.job_id where j.company_id = current_company_id())
  );

-- scheduled_interviews: company-scoped via application -> job.
create policy "Users can view scheduled interviews for their company's applications" on scheduled_interviews
  for select using (
    application_id in (select a.id from applications a join jobs j on j.id = a.job_id where j.company_id = current_company_id())
  );
create policy "Users can create scheduled interviews for their company's applications" on scheduled_interviews
  for insert with check (
    application_id in (select a.id from applications a join jobs j on j.id = a.job_id where j.company_id = current_company_id())
  );
create policy "Users can update scheduled interviews for their company's applications" on scheduled_interviews
  for update using (
    application_id in (select a.id from applications a join jobs j on j.id = a.job_id where j.company_id = current_company_id())
  );

-- interview_slot_locks: company-scoped via interviewer.
create policy "Users can view locks for their company's interviewers" on interview_slot_locks
  for select using (interviewer_id in (select id from interviewers where company_id = current_company_id()));

-- automation_rules: company-scoped.
create policy "Users can view their company's automation rules" on automation_rules
  for select using (company_id = current_company_id());
create policy "Users can create their company's automation rules" on automation_rules
  for insert with check (company_id = current_company_id());
create policy "Users can update their company's automation rules" on automation_rules
  for update using (company_id = current_company_id());

-- ---------------------------------------------------------------------------
-- Seed default email templates (version 1). Plain-text bodies with
-- {{variable}} placeholders rendered by lib/communication/logic.ts.
-- ---------------------------------------------------------------------------
insert into email_templates (template_name, version, subject, body, variables, is_latest) values
('ASSESSMENT_INVITATION', 1,
 'Your assessment for {{job_title}} at {{company_name}}',
 E'Hi {{candidate_name}},\n\nCongratulations on progressing to the next stage for the {{job_title}} role at {{company_name}}. Please complete your assessment by {{deadline}}.\n\nStart here: {{assessment_link}}\n\nGood luck!\n{{company_name}} Hiring Team',
 '["candidate_name","job_title","company_name","assessment_link","deadline"]',
 true),
('ASSESSMENT_REMINDER', 1,
 'Reminder: your {{job_title}} assessment is due {{deadline}}',
 E'Hi {{candidate_name}},\n\nJust a reminder that your assessment for {{job_title}} is due by {{deadline}}.\n\nComplete it here: {{assessment_link}}\n\nThanks,\n{{company_name}} Hiring Team',
 '["candidate_name","job_title","deadline","assessment_link","company_name"]',
 true),
('ASSESSMENT_SUBMITTED', 1,
 'We received your {{job_title}} assessment',
 E'Hi {{candidate_name}},\n\nThanks for submitting your assessment for {{job_title}}. Our team will review it and follow up with next steps soon.\n\n{{company_name}} Hiring Team',
 '["candidate_name","job_title","company_name"]',
 true),
('INTERVIEW_INVITATION', 1,
 'Interview scheduled: {{job_title}} on {{interview_date}}',
 E'Hi {{candidate_name}},\n\nYour interview for {{job_title}} is confirmed for {{interview_date}} at {{interview_time}} with {{interviewer_name}}.\n\nMeeting link: {{meeting_link}}\n\nWe look forward to speaking with you.\n{{company_name}} Hiring Team',
 '["candidate_name","job_title","interview_date","interview_time","interviewer_name","meeting_link","company_name"]',
 true),
('INTERVIEW_RESCHEDULE', 1,
 'Your {{job_title}} interview has been rescheduled',
 E'Hi {{candidate_name}},\n\nYour interview for {{job_title}} has been rescheduled to {{interview_date}} at {{interview_time}}.\n\nUpdated meeting link: {{meeting_link}}\n\n{{company_name}} Hiring Team',
 '["candidate_name","job_title","interview_date","interview_time","meeting_link","company_name"]',
 true),
('INTERVIEW_REMINDER', 1,
 'Reminder: your {{job_title}} interview is coming up',
 E'Hi {{candidate_name}},\n\nReminder: your interview for {{job_title}} is on {{interview_date}} at {{interview_time}}.\n\n{{company_name}} Hiring Team',
 '["candidate_name","job_title","interview_date","interview_time","company_name"]',
 true),
('NEXT_STEP', 1,
 'Next steps for your {{job_title}} application',
 E'Hi {{candidate_name}},\n\nGreat news — you have moved forward in the process for {{job_title}}.\n\nNext steps: {{next_steps}}\n\n{{company_name}} Hiring Team',
 '["candidate_name","job_title","next_steps","company_name"]',
 true),
('REJECTION', 1,
 'Update on your {{job_title}} application',
 E'Hi {{candidate_name}},\n\nThank you for taking the time to apply for {{job_title}} at {{company_name}}. After careful review, we won''t be moving forward with your application at this time. We wish you the best in your search.\n\n{{company_name}} Hiring Team',
 '["candidate_name","job_title","company_name"]',
 true),
('NEEDS_REVIEW', 1,
 'Your {{job_title}} application is under review',
 E'Hi {{candidate_name}},\n\nYour application for {{job_title}} is currently being reviewed by our team. We''ll follow up as soon as we have an update.\n\n{{company_name}} Hiring Team',
 '["candidate_name","job_title","company_name"]',
 true),
('FINAL_SELECTION', 1,
 'Congratulations — {{job_title}} at {{company_name}}',
 E'Hi {{candidate_name}},\n\nCongratulations! Next steps: {{next_steps}}\n\n{{company_name}} Hiring Team',
 '["candidate_name","job_title","next_steps","company_name"]',
 true),
('OFFER_NEXT_STEP', 1,
 'Your offer for {{job_title}} — next steps',
 E'Hi {{candidate_name}},\n\nNext steps regarding your offer: {{next_steps}}\n\n{{company_name}} Hiring Team',
 '["candidate_name","job_title","next_steps","company_name"]',
 true);


