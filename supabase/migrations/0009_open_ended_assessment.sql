-- ---------------------------------------------------------------------------
-- Open-ended assessments: a recruiter uploads a free-form task brief (PDF/
-- DOCX) instead of building structured MCQ/coding questions, and later
-- manually uploads the candidate's completed submission (received outside
-- the platform) so the AI can produce a qualitative review for the
-- interviewer — strengths, gaps, focus areas, suggested interview
-- questions, likely stuck points — rather than a pass/fail score. This is
-- additive: existing STRUCTURED assessments (questions + per-question AI
-- scoring) are untouched.
-- ---------------------------------------------------------------------------

alter table assessments
  add column if not exists assessment_type text not null default 'STRUCTURED'
    check (assessment_type in ('STRUCTURED', 'OPEN_ENDED')),
  add column if not exists brief_file_path text,
  add column if not exists brief_text text;

alter table assessment_assignments
  add column if not exists submission_file_path text,
  add column if not exists submission_text text,
  add column if not exists ai_review jsonb,
  add column if not exists ai_review_generated_at timestamptz;

-- ---------------------------------------------------------------------------
-- Storage: a separate private bucket from assessment-uploads (candidate
-- FILE_UPLOAD answers) since these objects are written by recruiters, not
-- candidates, under a different path convention:
--   briefs/{job_id}/{filename}       — the uploaded task brief
--   submissions/{assignment_id}/{filename} — the manually-uploaded submission
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('recruiter-uploads', 'recruiter-uploads', false)
on conflict (id) do nothing;

create policy "Recruiters can upload assessment briefs for their company's jobs" on storage.objects
  for insert with check (
    bucket_id = 'recruiter-uploads'
    and (storage.foldername(name))[1] = 'briefs'
    and (storage.foldername(name))[2]::uuid in (select id from jobs where company_id = current_company_id())
  );
create policy "Recruiters can view assessment briefs for their company's jobs" on storage.objects
  for select using (
    bucket_id = 'recruiter-uploads'
    and (storage.foldername(name))[1] = 'briefs'
    and (storage.foldername(name))[2]::uuid in (select id from jobs where company_id = current_company_id())
  );

create policy "Recruiters can upload submissions for their company's assignments" on storage.objects
  for insert with check (
    bucket_id = 'recruiter-uploads'
    and (storage.foldername(name))[1] = 'submissions'
    and (storage.foldername(name))[2]::uuid in (
      select aa.id from assessment_assignments aa
      join applications a on a.id = aa.application_id
      join jobs j on j.id = a.job_id
      where j.company_id = current_company_id()
    )
  );
create policy "Recruiters can view submissions for their company's assignments" on storage.objects
  for select using (
    bucket_id = 'recruiter-uploads'
    and (storage.foldername(name))[1] = 'submissions'
    and (storage.foldername(name))[2]::uuid in (
      select aa.id from assessment_assignments aa
      join applications a on a.id = aa.application_id
      join jobs j on j.id = a.job_id
      where j.company_id = current_company_id()
    )
  );
