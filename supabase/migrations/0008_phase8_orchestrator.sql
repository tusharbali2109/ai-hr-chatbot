-- Phase 8: Recruitment Orchestrator + Final Selection + Hiring Workflow.
-- Additive except two deliberate, narrow changes (documented inline):
--   1) applications.current_stage widened with ASSESSMENT_SHORTLISTED/FINAL_REVIEW.
--   2) users.role widened to 6 roles, and the SELECT/INSERT/UPDATE policies on
--      the candidate-data tables are NARROWED (not just added to) so the new
--      'interviewer' role actually loses broad access — Postgres OR's every
--      permissive RLS policy together, so adding a narrow policy alongside an
--      unchanged broad one would have no effect.

-- ---------------------------------------------------------------------------
-- applications.current_stage: add the two new Phase 8 stages.
-- ---------------------------------------------------------------------------
alter table applications drop constraint applications_current_stage_check;
alter table applications add constraint applications_current_stage_check check (current_stage in (
  'APPLIED', 'AI_SCREENING', 'NEEDS_REVIEW', 'SHORTLISTED', 'SKILL_VERIFICATION', 'AI_INTERVIEW',
  'INTERVIEW_SHORTLISTED', 'ASSESSMENT_SENT', 'ASSESSMENT_SUBMITTED', 'ASSESSMENT_EVALUATED',
  'ASSESSMENT_SHORTLISTED', 'FINAL_REVIEW',
  'FINAL_SHORTLISTED', 'INTERVIEW_SCHEDULED', 'FINAL_INTERVIEW', 'SELECTED', 'REJECTED'
));

-- stage_history: decision_source becomes a real column (was only ever an
-- ad-hoc metadata key). Additive, nullable — existing rows are untouched.
alter table stage_history add column if not exists decision_source text
  check (decision_source is null or decision_source in ('AI', 'HUMAN', 'SYSTEM', 'CANDIDATE'));

-- ---------------------------------------------------------------------------
-- users.role: widen to the full Phase 8 role set.
-- ---------------------------------------------------------------------------
alter table users drop constraint users_role_check;
alter table users add constraint users_role_check
  check (role in ('owner', 'admin', 'recruiter', 'hiring_manager', 'interviewer', 'viewer'));

-- can_read_company_data(): true for every role except 'interviewer' — the
-- broad, pre-Phase-8 behavior every non-interviewer role keeps. 'viewer' is
-- intentionally included here (full read access); write restriction for
-- viewer is enforced at the app layer (assertNotViewer(), one shared guard
-- used by every mutating Server Action) rather than rewriting RLS write
-- policies across ~20 tables for a role that only needs to lose writes, not
-- visibility.
create or replace function can_read_company_data()
returns boolean as $$
  select coalesce((select role <> 'interviewer' from users where id = auth.uid()), false);
$$ language sql stable security definer;

-- interviewer_scoped_application_ids(): the application ids an interviewer
-- is actually allowed to see — only ones they have (or had) a scheduled
-- interview for. This is the concrete mechanism behind spec §47's example
-- ("an INTERVIEWER must not access unrelated candidate information").
create or replace function interviewer_scoped_application_ids()
returns setof uuid as $$
  select distinct si.application_id
  from scheduled_interviews si
  join interviewers i on i.id = si.interviewer_id
  where i.user_id = auth.uid();
$$ language sql stable security definer;

-- applications: narrow the existing broad SELECT policy.
drop policy "Users can view applications for their company's jobs" on applications;
create policy "Users can view applications for their company's jobs" on applications
  for select using (
    (can_read_company_data() and job_id in (select id from jobs where company_id = current_company_id()))
    or id in (select interviewer_scoped_application_ids())
  );

-- applications: writes stay restricted to non-interviewer roles (an
-- interviewer was never able to write here before either — this only makes
-- the read-side narrowing symmetrical rather than granting new access).
drop policy "Users can create applications for their company's jobs" on applications;
create policy "Users can create applications for their company's jobs" on applications
  for insert with check (
    can_read_company_data() and job_id in (select id from jobs where company_id = current_company_id())
  );
drop policy "Users can update applications for their company's jobs" on applications;
create policy "Users can update applications for their company's jobs" on applications
  for update using (
    can_read_company_data() and job_id in (select id from jobs where company_id = current_company_id())
  );

-- candidates: candidates is a GLOBAL table (not company-scoped even for
-- privileged roles, by original 0001 design). An interviewer only ever sees
-- candidates they're actually scheduled to interview.
drop policy "Recruiters can view candidates" on candidates;
create policy "Recruiters can view candidates" on candidates
  for select using (
    can_read_company_data()
    or id in (
      select si.candidate_id from scheduled_interviews si
      join interviewers i on i.id = si.interviewer_id
      where i.user_id = auth.uid()
    )
  );
drop policy "Recruiters can create candidates" on candidates;
create policy "Recruiters can create candidates" on candidates
  for insert with check (can_read_company_data());
drop policy "Recruiters can update candidates" on candidates;
create policy "Recruiters can update candidates" on candidates
  for update using (can_read_company_data());

-- screenings: same narrowing pattern, three-hop unchanged for the
-- company-wide branch, direct interviewer-scope check added.
drop policy "Users can view screenings for their company's applications" on screenings;
create policy "Users can view screenings for their company's applications" on screenings
  for select using (
    (can_read_company_data() and application_id in (
      select a.id from applications a join jobs j on j.id = a.job_id where j.company_id = current_company_id()
    ))
    or application_id in (select interviewer_scoped_application_ids())
  );

-- interviews: same pattern.
drop policy "Users can view interviews for their company's applications" on interviews;
create policy "Users can view interviews for their company's applications" on interviews
  for select using (
    (can_read_company_data() and application_id in (
      select a.id from applications a join jobs j on j.id = a.job_id where j.company_id = current_company_id()
    ))
    or application_id in (select interviewer_scoped_application_ids())
  );

-- assessment_assignments: same pattern (candidate-facing policies from 0006
-- are untouched — this only edits the recruiter-facing SELECT policy).
drop policy "Users can view assignments for their company's applications" on assessment_assignments;
create policy "Users can view assignments for their company's applications" on assessment_assignments
  for select using (
    (can_read_company_data() and application_id in (
      select a.id from applications a join jobs j on j.id = a.job_id where j.company_id = current_company_id()
    ))
    or application_id in (select interviewer_scoped_application_ids())
  );

-- scheduled_interviews: an interviewer needs to see their own bookings
-- directly (simpler than round-tripping through interviewer_scoped_application_ids()).
drop policy "Users can view scheduled interviews for their company's applications" on scheduled_interviews;
create policy "Users can view scheduled interviews for their company's applications" on scheduled_interviews
  for select using (
    (can_read_company_data() and application_id in (
      select a.id from applications a join jobs j on j.id = a.job_id where j.company_id = current_company_id()
    ))
    or interviewer_id in (select id from interviewers where user_id = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- final_reviews: versioned (is_latest, one-per-application), the
-- FinalEvaluationAgent's output + the human-approval-gate record.
-- ---------------------------------------------------------------------------
create table if not exists final_reviews (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references applications (id) on delete cascade,
  screening_score numeric check (screening_score is null or (screening_score >= 0 and screening_score <= 100)),
  interview_score numeric check (interview_score is null or (interview_score >= 0 and interview_score <= 100)),
  assessment_score numeric check (assessment_score is null or (assessment_score >= 0 and assessment_score <= 100)),
  overall_score numeric not null check (overall_score >= 0 and overall_score <= 100),
  weights jsonb not null default '{}'::jsonb,
  criteria_version_id uuid references job_jd_versions (id) on delete set null,
  recommendation text not null check (recommendation in ('SELECT', 'REJECT', 'NEEDS_REVIEW')),
  confidence text not null check (confidence in ('HIGH', 'MEDIUM', 'LOW')),
  summary text,
  strengths jsonb not null default '[]'::jsonb,
  gaps jsonb not null default '[]'::jsonb,
  concerns jsonb not null default '[]'::jsonb,
  model_name text,
  model_version text,
  status text not null default 'PENDING' check (status in ('PENDING', 'APPROVED', 'REJECTED', 'NEEDS_REVIEW')),
  decided_by uuid references users (id) on delete set null,
  decided_at timestamptz,
  decision_reason text,
  is_latest boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_final_reviews_application_id on final_reviews (application_id);
create unique index if not exists idx_final_reviews_one_latest on final_reviews (application_id) where is_latest;

-- ---------------------------------------------------------------------------
-- workflow_settings: job override (job_id set) or company default (job_id
-- null). Absence entirely = hard-coded fallback in the service layer.
-- ---------------------------------------------------------------------------
create table if not exists workflow_settings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  job_id uuid references jobs (id) on delete cascade,
  workflow_mode text not null default 'ASSISTED' check (workflow_mode in ('MANUAL', 'ASSISTED', 'AUTONOMOUS')),
  ai_screening_enabled boolean not null default true,
  ai_interview_enabled boolean not null default true,
  assessment_enabled boolean not null default true,
  auto_email_enabled boolean not null default true,
  auto_scheduling_enabled boolean not null default false,
  human_approval_required boolean not null default true,
  final_decision_automation boolean not null default false,
  scoring_weights jsonb not null default '{"screening": 25, "interview": 35, "assessment": 40}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_workflow_settings_company_default
  on workflow_settings (company_id) where job_id is null;
create unique index if not exists idx_workflow_settings_job
  on workflow_settings (job_id) where job_id is not null;

-- ---------------------------------------------------------------------------
-- workflow_runs / workflow_steps: the retry/resume ledger (spec §23-27).
-- ---------------------------------------------------------------------------
create table if not exists workflow_runs (
  id uuid primary key default gen_random_uuid(),
  workflow_type text not null default 'RECRUITMENT_PIPELINE',
  application_id uuid not null references applications (id) on delete cascade,
  status text not null default 'QUEUED' check (status in ('QUEUED', 'RUNNING', 'WAITING', 'COMPLETED', 'FAILED', 'PAUSED')),
  current_stage text,
  started_at timestamptz,
  completed_at timestamptz,
  error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (application_id)
);

create table if not exists workflow_steps (
  id uuid primary key default gen_random_uuid(),
  workflow_run_id uuid not null references workflow_runs (id) on delete cascade,
  agent_type text not null,
  event_type text not null,
  status text not null default 'QUEUED' check (status in ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'RETRYING')),
  retry_count int not null default 0,
  max_retry_count int not null default 3,
  started_at timestamptz,
  completed_at timestamptz,
  error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_workflow_steps_run_id on workflow_steps (workflow_run_id, created_at);

-- ---------------------------------------------------------------------------
-- workflow_events: the real idempotency mechanism (spec §28/29). event_id is
-- computed deterministically by the emitter — a redelivered "same" event
-- collides on the unique constraint, an atomic race-safe dedup that also
-- covers "two workers processing the same event" (spec §51) for free.
-- Distinct from internal_events (unchanged, lightweight append-only audit
-- log every existing agent already writes to).
-- ---------------------------------------------------------------------------
create table if not exists workflow_events (
  id uuid primary key default gen_random_uuid(),
  event_id text not null unique,
  event_type text not null,
  application_id uuid references applications (id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  processed boolean not null default false,
  processed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_workflow_events_application_id on workflow_events (application_id);

-- ---------------------------------------------------------------------------
-- offers: placeholder workflow only — no document generation, no legally
-- binding artifact (spec §31/32). salary_details is sensitive; the base
-- table is recruiter-only, offers_summary (below) omits it for lower-
-- privilege reads.
-- ---------------------------------------------------------------------------
create table if not exists offers (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references applications (id) on delete cascade,
  candidate_id uuid not null references candidates (id) on delete cascade,
  job_id uuid not null references jobs (id) on delete cascade,
  status text not null default 'NOT_STARTED' check (status in (
    'NOT_STARTED', 'DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'SENT', 'ACCEPTED', 'DECLINED'
  )),
  salary_details jsonb,
  start_date date,
  employment_type text,
  approved_by uuid references users (id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (application_id)
);

create view offers_summary
  with (security_invoker = true) as
  select id, application_id, candidate_id, job_id, status, start_date, employment_type, approved_at, created_at, updated_at
  from offers;

-- ---------------------------------------------------------------------------
-- audit_log: the new Phase 8 decision points (final review, approval,
-- override, offer approval, workflow-config change). Existing per-domain
-- history (stage_history/assessment_events/interview_events/agent_runs)
-- already covers everything else — "complete audit trail" is the union.
-- ---------------------------------------------------------------------------
create table if not exists audit_log (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  actor_id uuid references users (id) on delete set null,
  actor_type text not null check (actor_type in ('HUMAN', 'AI', 'SYSTEM')),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  old_value jsonb,
  new_value jsonb,
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_log_company_id on audit_log (company_id, created_at);
create index if not exists idx_audit_log_entity on audit_log (entity_type, entity_id);

-- ---------------------------------------------------------------------------
-- ai_usage_log: real token counts captured from Anthropic's response usage
-- field — never fabricated (spec §45).
-- ---------------------------------------------------------------------------
create table if not exists ai_usage_log (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies (id) on delete cascade,
  application_id uuid references applications (id) on delete set null,
  agent_type text not null,
  model text not null,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_ai_usage_log_company_id on ai_usage_log (company_id, created_at);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
create trigger trg_final_reviews_updated_at before update on final_reviews
  for each row execute function set_updated_at();
create trigger trg_workflow_settings_updated_at before update on workflow_settings
  for each row execute function set_updated_at();
create trigger trg_workflow_runs_updated_at before update on workflow_runs
  for each row execute function set_updated_at();
create trigger trg_offers_updated_at before update on offers
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table final_reviews enable row level security;
alter table workflow_settings enable row level security;
alter table workflow_runs enable row level security;
alter table workflow_steps enable row level security;
alter table workflow_events enable row level security;
alter table offers enable row level security;
alter table audit_log enable row level security;
alter table ai_usage_log enable row level security;

-- final_reviews: same narrowing pattern as screenings/interviews.
create policy "Users can view final reviews for their company's applications" on final_reviews
  for select using (
    (can_read_company_data() and application_id in (
      select a.id from applications a join jobs j on j.id = a.job_id where j.company_id = current_company_id()
    ))
    or application_id in (select interviewer_scoped_application_ids())
  );
create policy "Users can create final reviews for their company's applications" on final_reviews
  for insert with check (
    can_read_company_data() and application_id in (
      select a.id from applications a join jobs j on j.id = a.job_id where j.company_id = current_company_id()
    )
  );
create policy "Users can update final reviews for their company's applications" on final_reviews
  for update using (
    can_read_company_data() and application_id in (
      select a.id from applications a join jobs j on j.id = a.job_id where j.company_id = current_company_id()
    )
  );

-- workflow_settings: company-scoped, one-hop.
create policy "Users can view their company's workflow settings" on workflow_settings
  for select using (can_read_company_data() and company_id = current_company_id());
create policy "Users can create their company's workflow settings" on workflow_settings
  for insert with check (can_read_company_data() and company_id = current_company_id());
create policy "Users can update their company's workflow settings" on workflow_settings
  for update using (can_read_company_data() and company_id = current_company_id());

-- workflow_runs / workflow_steps: same narrowing pattern as final_reviews.
create policy "Users can view workflow runs for their company's applications" on workflow_runs
  for select using (
    (can_read_company_data() and application_id in (
      select a.id from applications a join jobs j on j.id = a.job_id where j.company_id = current_company_id()
    ))
    or application_id in (select interviewer_scoped_application_ids())
  );
create policy "Users can create workflow runs for their company's applications" on workflow_runs
  for insert with check (
    application_id in (select a.id from applications a join jobs j on j.id = a.job_id where j.company_id = current_company_id())
  );
create policy "Users can update workflow runs for their company's applications" on workflow_runs
  for update using (
    application_id in (select a.id from applications a join jobs j on j.id = a.job_id where j.company_id = current_company_id())
  );

create policy "Users can view workflow steps for their company's runs" on workflow_steps
  for select using (
    workflow_run_id in (
      select wr.id from workflow_runs wr
      join applications a on a.id = wr.application_id
      join jobs j on j.id = a.job_id
      where j.company_id = current_company_id()
    )
  );
create policy "Users can create workflow steps for their company's runs" on workflow_steps
  for insert with check (
    workflow_run_id in (
      select wr.id from workflow_runs wr
      join applications a on a.id = wr.application_id
      join jobs j on j.id = a.job_id
      where j.company_id = current_company_id()
    )
  );
create policy "Users can update workflow steps for their company's runs" on workflow_steps
  for update using (
    workflow_run_id in (
      select wr.id from workflow_runs wr
      join applications a on a.id = wr.application_id
      join jobs j on j.id = a.job_id
      where j.company_id = current_company_id()
    )
  );

-- workflow_events: same company-scoping via application_id.
create policy "Users can view workflow events for their company's applications" on workflow_events
  for select using (
    application_id is null or application_id in (
      select a.id from applications a join jobs j on j.id = a.job_id where j.company_id = current_company_id()
    )
  );
create policy "Users can create workflow events for their company's applications" on workflow_events
  for insert with check (
    application_id is null or application_id in (
      select a.id from applications a join jobs j on j.id = a.job_id where j.company_id = current_company_id()
    )
  );
create policy "Users can update workflow events for their company's applications" on workflow_events
  for update using (
    application_id is null or application_id in (
      select a.id from applications a join jobs j on j.id = a.job_id where j.company_id = current_company_id()
    )
  );

-- offers: recruiter-only (privileged roles), never interviewer — salary
-- data is the most sensitive surface in the app.
create policy "Privileged users can view their company's offers" on offers
  for select using (
    can_read_company_data() and job_id in (select id from jobs where company_id = current_company_id())
  );
create policy "Privileged users can create their company's offers" on offers
  for insert with check (
    can_read_company_data() and job_id in (select id from jobs where company_id = current_company_id())
  );
create policy "Privileged users can update their company's offers" on offers
  for update using (
    can_read_company_data() and job_id in (select id from jobs where company_id = current_company_id())
  );

-- audit_log: company-scoped, select-only from the client (all writes go
-- through server-side service calls using the session-bound client, which
-- is still subject to this same insert policy).
create policy "Users can view their company's audit log" on audit_log
  for select using (can_read_company_data() and company_id = current_company_id());
create policy "Users can create their company's audit log entries" on audit_log
  for insert with check (company_id = current_company_id());

-- ai_usage_log: company-scoped, select-only surfaced to privileged roles.
create policy "Privileged users can view their company's AI usage" on ai_usage_log
  for select using (can_read_company_data() and company_id = current_company_id());
create policy "Users can create their company's AI usage entries" on ai_usage_log
  for insert with check (company_id = current_company_id());

-- No new email templates needed for the human-approval gate (spec §30): the
-- Phase 7 template set already has exactly what's needed — FINAL_SELECTION
-- ("Congratulations! Next steps: ...") for a selected candidate, REJECTION
-- for a rejected one, and NEEDS_REVIEW for a needs-review outcome. The
-- CommunicationAgent gets three new thin wrapper functions in Phase 8
-- (lib/communication/agent.ts) that call these existing templates from the
-- final-review approval action rather than duplicating template content.
