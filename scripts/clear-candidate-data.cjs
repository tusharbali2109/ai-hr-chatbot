// One-off reset of candidate records and history; preserves accounts/jobs/settings.
require('dotenv').config({ path: '.env.local', quiet: true });
const { createClient } = require('@supabase/supabase-js');
if (process.env.NEXT_PUBLIC_SUPABASE_URL !== 'https://fjqisnvuihwvcfkmojvy.supabase.co') throw new Error('Unexpected project');
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
async function files(bucket, prefix = '') {
  const result = [];
  for (let offset = 0; ; offset += 100) {
    const { data, error } = await db.storage.from(bucket).list(prefix, { limit: 100, offset });
    if (error) throw error;
    for (const item of data) {
      const path = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.id) result.push(path); else result.push(...await files(bucket, path));
    }
    if (data.length < 100) return result;
  }
}
async function main() {
  for (const bucket of ['public-resumes', 'assessment-uploads']) {
    const paths = await files(bucket);
    if (process.argv.includes('--execute')) {
      for (let i = 0; i < paths.length; i += 100) {
        const { error } = await db.storage.from(bucket).remove(paths.slice(i, i + 100));
        if (error) throw error;
      }
    }
    console.log(bucket, process.argv.includes('--execute') ? 'deleted files:' : 'files:', paths.length);
  }
  const tables = ['email_messages', 'external_events', 'internal_events', 'workflow_events', 'audit_log', 'ai_usage_log', 'candidate_login_attempts', 'candidates'];
  for (const table of tables) {
    const result = process.argv.includes('--execute')
      ? await db.from(table).delete({ count: 'exact' }).not('id', 'is', null)
      : await db.from(table).select('*', { count: 'exact', head: true });
    if (result.error) throw new Error(`${table}: ${result.error.message}`);
    console.log(table, result.count);
  }
  for (const table of ['candidates', 'applications', 'stage_history', 'screenings', 'interviews', 'interview_questions', 'interview_answers', 'assessment_assignments', 'workday_assignments']) {
    const { count, error } = await db.from(table).select('*', { count: 'exact', head: true });
    if (error) throw error;
    console.log('remaining', table, count);
    if (process.argv.includes('--execute') && count !== 0) throw new Error(`${table} still has data`);
  }
  if (process.argv.includes('--execute')) {
    for (const bucket of ['public-resumes', 'assessment-uploads']) {
      if ((await files(bucket)).length) throw new Error(`${bucket} still has files`);
    }
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
