-- ---------------------------------------------------------------------------
-- candidate_login_attempts: lightweight log of a candidate's Google
-- sign-in attempts that were rejected because the signed-in email didn't
-- match any *eligible* candidate yet (see lib/services/candidate-auth.ts::
-- linkCandidateAuth's "no_assessment_for_email" outcome). Gives recruiters a
-- signal, on the candidate detail page, that someone is actively trying to
-- get in — informational only, no PII beyond the email already on file.
-- ---------------------------------------------------------------------------
create table if not exists candidate_login_attempts (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  attempted_at timestamptz not null default now()
);

create index if not exists candidate_login_attempts_email_idx on candidate_login_attempts (lower(email));

alter table candidate_login_attempts enable row level security;

-- Logged from app/candidate/auth/callback/route.ts using the session-based
-- client created by the OAuth code exchange (not service-role) — so any
-- authenticated user (candidate or recruiter) may insert an attempt row.
create policy "Authenticated users can log a login attempt" on candidate_login_attempts
  for insert with check (auth.uid() is not null);

-- Readable by a recruiter only for candidates that belong to their own
-- company (same company-scoping idiom as 0001_init.sql's current_company_id()),
-- resolved via candidates -> applications -> jobs since candidates themselves
-- aren't directly company-scoped.
create policy "Users can view login attempts for their company's candidates" on candidate_login_attempts
  for select using (
    lower(email) in (
      select lower(c.email)
      from candidates c
      join applications a on a.candidate_id = c.id
      join jobs j on j.id = a.job_id
      where j.company_id = current_company_id()
    )
  );
