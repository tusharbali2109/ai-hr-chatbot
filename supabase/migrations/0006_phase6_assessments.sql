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
