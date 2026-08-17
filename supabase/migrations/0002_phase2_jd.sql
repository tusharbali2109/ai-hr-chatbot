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
