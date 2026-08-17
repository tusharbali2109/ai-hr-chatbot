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
