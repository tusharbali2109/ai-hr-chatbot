-- Phase 9: Candidate Digital Workday — job-relevant work-sample simulation.

create table workday_simulations (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs(id) on delete cascade,
  company_id uuid not null references companies(id) on delete cascade,
  title text not null,
  description text not null default '',
  duration_minutes int not null default 60 check (duration_minutes between 15 and 240),
  status text not null default 'DRAFT' check (status in ('DRAFT','READY','ARCHIVED')),
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table workday_tasks (
  id uuid primary key default gen_random_uuid(),
  simulation_id uuid not null references workday_simulations(id) on delete cascade,
  sequence int not null,
  task_type text not null check (task_type in ('INBOX','CUSTOMER_ESCALATION','PRIORITIZATION','DOCUMENT_REVIEW','DECISION','REFLECTION')),
  title text not null,
  scenario text not null,
  deliverable text not null,
  time_budget_minutes int not null check (time_budget_minutes between 2 and 120),
  rubric jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  unique(simulation_id, sequence)
);

create table workday_assignments (
  id uuid primary key default gen_random_uuid(),
  simulation_id uuid not null references workday_simulations(id) on delete cascade,
  application_id uuid not null references applications(id) on delete cascade,
  candidate_id uuid not null references candidates(id) on delete cascade,
  status text not null default 'ASSIGNED' check (status in ('ASSIGNED','IN_PROGRESS','SUBMITTED','EVALUATED','EXPIRED','CANCELLED')),
  deadline timestamptz not null,
  started_at timestamptz,
  submitted_at timestamptz,
  overall_score numeric check (overall_score between 0 and 100),
  recommendation text check (recommendation in ('ADVANCE','REJECT','NEEDS_REVIEW')),
  evaluation_summary text,
  dimension_scores jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(simulation_id, application_id)
);

create table workday_responses (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references workday_assignments(id) on delete cascade,
  task_id uuid not null references workday_tasks(id) on delete cascade,
  response_text text not null default '',
  assumptions text not null default '',
  ai_usage_disclosure text not null default '',
  confidence int check (confidence between 1 and 5),
  score numeric check (score between 0 and 100),
  evaluator_feedback text,
  auto_saved_at timestamptz not null default now(),
  submitted_at timestamptz,
  unique(assignment_id, task_id)
);

create table workday_events (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references workday_assignments(id) on delete cascade,
  event_type text not null check (event_type in ('SESSION_OPENED','TASK_VIEWED','RESPONSE_SAVED','TASK_SUBMITTED','SESSION_SUBMITTED')),
  task_id uuid references workday_tasks(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index idx_workday_simulations_job on workday_simulations(job_id);
create index idx_workday_tasks_simulation on workday_tasks(simulation_id, sequence);
create index idx_workday_assignments_candidate on workday_assignments(candidate_id, status);
create index idx_workday_events_assignment on workday_events(assignment_id, created_at);

alter table workday_simulations enable row level security;
alter table workday_tasks enable row level security;
alter table workday_assignments enable row level security;
alter table workday_responses enable row level security;
alter table workday_events enable row level security;

create policy "Recruiters manage company workday simulations" on workday_simulations for all to authenticated
  using (company_id = current_company_id()) with check (company_id = current_company_id());
create policy "Recruiters manage company workday tasks" on workday_tasks for all to authenticated
  using (simulation_id in (select id from workday_simulations where company_id = current_company_id()))
  with check (simulation_id in (select id from workday_simulations where company_id = current_company_id()));
create policy "Recruiters manage company workday assignments" on workday_assignments for all to authenticated
  using (application_id in (select id from applications where job_id in (select id from jobs where company_id = current_company_id())))
  with check (application_id in (select id from applications where job_id in (select id from jobs where company_id = current_company_id())));
create policy "Recruiters manage company workday responses" on workday_responses for all to authenticated
  using (assignment_id in (select wa.id from workday_assignments wa join applications a on a.id=wa.application_id join jobs j on j.id=a.job_id where j.company_id=current_company_id()))
  with check (assignment_id in (select wa.id from workday_assignments wa join applications a on a.id=wa.application_id join jobs j on j.id=a.job_id where j.company_id=current_company_id()));
create policy "Recruiters view company workday events" on workday_events for select to authenticated
  using (assignment_id in (select wa.id from workday_assignments wa join applications a on a.id=wa.application_id join jobs j on j.id=a.job_id where j.company_id=current_company_id()));

create policy "Candidates view own workday assignments" on workday_assignments for select to authenticated
  using (candidate_id = candidate_id_for_auth());
create policy "Candidates update own workday assignments" on workday_assignments for update to authenticated
  using (candidate_id = candidate_id_for_auth()) with check (candidate_id = candidate_id_for_auth());
create policy "Candidates view assigned workday tasks" on workday_tasks for select to authenticated
  using (simulation_id in (select simulation_id from workday_assignments where candidate_id=candidate_id_for_auth()));
create policy "Candidates manage own workday responses" on workday_responses for all to authenticated
  using (assignment_id in (select id from workday_assignments where candidate_id=candidate_id_for_auth()))
  with check (assignment_id in (select id from workday_assignments where candidate_id=candidate_id_for_auth()));
create policy "Candidates create own workday events" on workday_events for insert to authenticated
  with check (assignment_id in (select id from workday_assignments where candidate_id=candidate_id_for_auth()));

grant select, insert, update, delete on workday_simulations, workday_assignments, workday_responses to authenticated;
grant insert, update, delete on workday_tasks to authenticated;
grant select (id, simulation_id, sequence, task_type, title, scenario, deliverable, time_budget_minutes, created_at) on workday_tasks to authenticated;
grant select, insert on workday_events to authenticated;

create trigger trg_workday_simulations_updated_at before update on workday_simulations for each row execute function set_updated_at();
create trigger trg_workday_assignments_updated_at before update on workday_assignments for each row execute function set_updated_at();

-- Expand the existing candidate-login eligibility gate: a candidate may
-- claim their matching profile when assigned either a traditional assessment
-- or a Digital Workday. The existing email-match and one-time claim checks in
-- migration 0006 remain unchanged.
create or replace function candidate_has_assignment(check_candidate_id uuid)
returns boolean as $$
  select exists (select 1 from assessment_assignments where candidate_id = check_candidate_id)
      or exists (select 1 from workday_assignments where candidate_id = check_candidate_id);
$$ language sql stable security definer set search_path = public;
revoke all on function candidate_has_assignment(uuid) from public;
grant execute on function candidate_has_assignment(uuid) to authenticated;
