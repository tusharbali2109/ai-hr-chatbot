-- ---------------------------------------------------------------------------
-- Browser-based AI video interview: a candidate-facing channel alongside the
-- existing Twilio phone interview, reusing the same interviews/
-- interview_questions/interview_answers/interview_events tables and the same
-- conversation engine (lib/interview/conversation.ts's processTurn) and
-- scoring (evaluateInterview) — only the transport differs (getUserMedia +
-- Web Speech APIs in the browser, driven by server actions, instead of
-- Twilio's <Gather> TwiML loop). No new tables; provider gets a third value
-- and candidates get scoped RLS access to their own browser interview rows
-- (they previously had none at all — every existing policy on these four
-- tables is recruiter/company-scoped only).
-- ---------------------------------------------------------------------------

alter table interviews drop constraint interviews_provider_check;
alter table interviews add constraint interviews_provider_check
  check (provider in ('mock', 'twilio', 'browser'));

alter table interview_events drop constraint interview_events_event_type_check;
alter table interview_events add constraint interview_events_event_type_check
  check (event_type in (
    'CALL_STARTED', 'AI_INTRO', 'CONSENT_RECEIVED', 'CONSENT_DECLINED', 'QUESTION_ASKED',
    'ANSWER_RECEIVED', 'FOLLOWUP_GENERATED', 'SECTION_COMPLETED', 'CALL_ENDED',
    'EVALUATION_COMPLETED', 'CALL_FAILED', 'HUMAN_OVERRIDE',
    'CAMERA_ENABLED', 'PROCTORING_WARNING'
  ));

-- Candidate eligibility gate (proxy for candidate-login purposes) — a
-- candidate may also claim their profile when a browser interview exists,
-- exactly the same additive pattern 0006 -> phase9 already used to add
-- workday_assignments alongside assessment_assignments.
create or replace function candidate_has_assignment(check_candidate_id uuid)
returns boolean as $$
  select exists (select 1 from assessment_assignments where candidate_id = check_candidate_id)
      or exists (select 1 from workday_assignments where candidate_id = check_candidate_id)
      or exists (
        select 1 from interviews i
        join applications a on a.id = i.application_id
        where a.candidate_id = check_candidate_id and i.provider = 'browser'
      );
$$ language sql stable security definer set search_path = public;

-- ---------------------------------------------------------------------------
-- Candidate RLS — scoped to provider = 'browser' only, so a candidate can
-- never read/touch a phone-interview row even if is somehow reachable.
-- Score/recommendation/summary/strengths/gaps/concerns are never sent to the
-- browser regardless (app-layer column projection, same discipline as
-- AssessmentPublic) — this grants row access, not a promise every column is
-- safe to render.
-- ---------------------------------------------------------------------------
create policy "Candidates can view their own browser interview" on interviews
  for select using (
    provider = 'browser'
    and application_id in (select id from applications where candidate_id = candidate_id_for_auth())
  );
create policy "Candidates can update their own browser interview" on interviews
  for update using (
    provider = 'browser'
    and application_id in (select id from applications where candidate_id = candidate_id_for_auth())
  );

create policy "Candidates can view questions for their own browser interview" on interview_questions
  for select using (
    interview_id in (
      select i.id from interviews i
      join applications a on a.id = i.application_id
      where i.provider = 'browser' and a.candidate_id = candidate_id_for_auth()
    )
  );
create policy "Candidates can create followup questions for their own browser interview" on interview_questions
  for insert with check (
    interview_id in (
      select i.id from interviews i
      join applications a on a.id = i.application_id
      where i.provider = 'browser' and a.candidate_id = candidate_id_for_auth()
    )
  );

create policy "Candidates can view answers for their own browser interview" on interview_answers
  for select using (
    interview_id in (
      select i.id from interviews i
      join applications a on a.id = i.application_id
      where i.provider = 'browser' and a.candidate_id = candidate_id_for_auth()
    )
  );
create policy "Candidates can submit answers for their own browser interview" on interview_answers
  for insert with check (
    interview_id in (
      select i.id from interviews i
      join applications a on a.id = i.application_id
      where i.provider = 'browser' and a.candidate_id = candidate_id_for_auth()
    )
  );

create policy "Candidates can view events for their own browser interview" on interview_events
  for select using (
    interview_id in (
      select i.id from interviews i
      join applications a on a.id = i.application_id
      where i.provider = 'browser' and a.candidate_id = candidate_id_for_auth()
    )
  );
create policy "Candidates can create events for their own browser interview" on interview_events
  for insert with check (
    interview_id in (
      select i.id from interviews i
      join applications a on a.id = i.application_id
      where i.provider = 'browser' and a.candidate_id = candidate_id_for_auth()
    )
  );
