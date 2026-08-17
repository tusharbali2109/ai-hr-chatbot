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
