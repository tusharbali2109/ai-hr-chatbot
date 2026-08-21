-- Admin role enforcement: grant the admin role to the designated account,
-- and make sure destructive actions (deleting a job or a candidate) are
-- restricted to admins at the database level, not just in the app layer.
-- App-level enforcement lives in lib/services/auth.ts (requireAdmin()),
-- used by lib/actions/candidates.ts::deleteCandidateAction and
-- lib/actions/jobs.ts::deleteJobAction — but RLS is the actual boundary
-- if anyone ever talks to Supabase directly (e.g. via the client SDK, or
-- a bug in the app layer), so it needs the same rule.

-- ---------------------------------------------------------------------------
-- Grant admin to the designated account
-- ---------------------------------------------------------------------------
update users set role = 'admin' where email = 'tusharbali855@gmail.com';

-- ---------------------------------------------------------------------------
-- helper: is the calling user an admin?
-- ---------------------------------------------------------------------------
create or replace function current_user_is_admin()
returns boolean as $$
  select coalesce((select role from users where id = auth.uid()) = 'admin', false);
$$ language sql stable security definer;

-- ---------------------------------------------------------------------------
-- jobs: the original "Users can delete their company's jobs" policy
-- (0001_init.sql) let any authenticated teammate delete a job. Replace it
-- with an admin-only + same-company version.
-- ---------------------------------------------------------------------------
drop policy if exists "Users can delete their company's jobs" on jobs;

create policy "Admins can delete their company's jobs" on jobs
  for delete using (company_id = current_company_id() and current_user_is_admin());

-- ---------------------------------------------------------------------------
-- candidates: no delete policy existed before this migration, so deletes
-- were already implicitly denied under RLS (enabled with no matching
-- policy = deny). Add an explicit admin-only policy so intent is clear
-- and future policy changes don't accidentally loosen it.
-- ---------------------------------------------------------------------------
create policy "Admins can delete candidates" on candidates
  for delete using (current_user_is_admin());
