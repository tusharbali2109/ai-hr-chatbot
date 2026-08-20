-- ---------------------------------------------------------------------------
-- Public careers site: the missing candidate entry point. Previously the
-- only way an application row could exist was a job-board webhook or a
-- recruiter's manual "Sync Now" against a connector — with job boards
-- mock-only (see lib/jobboards/registry.ts), there was no way for a real
-- candidate to apply at all. This adds a public, unauthenticated apply flow
-- reusing the exact same ingestApplicant() pipeline webhooks already use.
--
-- Public job reads (GET /careers, /careers/[jobId]) go through the
-- service-role client server-side (same pattern as webhooks), NOT a new
-- anon RLS policy on `jobs` — anon SELECT stays closed, avoiding any risk
-- of leaking draft/internal job data through the public anon key.
--
-- Resume uploads from the public apply form are written by the server
-- (service role) in app/api/careers/apply/route.ts, so no anon INSERT
-- storage policy is needed there. Recruiters also write to this same
-- bucket directly from their own session when manually adding a candidate
-- (lib/actions/candidates.ts) — same path convention ({job_id}/...), so one
-- INSERT policy covers both the recruiter-add flow and lets recruiters view
-- either kind of resume.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('public-resumes', 'public-resumes', false)
on conflict (id) do nothing;

create policy "Recruiters can view resumes for their company's jobs" on storage.objects
  for select using (
    bucket_id = 'public-resumes'
    and (storage.foldername(name))[1]::uuid in (select id from jobs where company_id = current_company_id())
  );
create policy "Recruiters can upload resumes for their company's jobs" on storage.objects
  for insert with check (
    bucket_id = 'public-resumes'
    and (storage.foldername(name))[1]::uuid in (select id from jobs where company_id = current_company_id())
  );
