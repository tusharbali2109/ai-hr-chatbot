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
