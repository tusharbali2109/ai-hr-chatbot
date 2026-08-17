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
