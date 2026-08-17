/**
 * Demo data seed script. Uses the Supabase service-role key to bypass RLS —
 * run locally only (`npm run seed`), never bundled into the app.
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";
import { RECRUITMENT_STAGES, type RecruitmentStage } from "@/lib/stages";
import {
  JOB_FIXTURES,
  CANDIDATE_FIXTURES,
  SOURCES,
  STAGE_DISTRIBUTION,
} from "@/lib/demo-data/fixtures";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SEED_COMPANY_NAME = process.env.SEED_COMPANY_NAME || "Nova Robotics";
const SEED_USER_EMAIL = process.env.SEED_USER_EMAIL || "recruiter@example.com";
const SEED_USER_PASSWORD = process.env.SEED_USER_PASSWORD || "change-me-please";

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local — see .env.example."
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

function stagesUpTo(target: RecruitmentStage): RecruitmentStage[] {
  if (target === "REJECTED") return ["APPLIED", "AI_SCREENING", "REJECTED"];
  const idx = RECRUITMENT_STAGES.indexOf(target);
  return RECRUITMENT_STAGES.slice(0, idx + 1) as RecruitmentStage[];
}

function scoreForStage(stage: RecruitmentStage, seed: number): number | null {
  if (stage === "APPLIED") return null;
  if (stage === "REJECTED") return 35 + (seed % 20);
  return 55 + (seed % 40);
}

async function ensureCompany(): Promise<string> {
  const { data: existing } = await supabase
    .from("companies")
    .select("id")
    .eq("name", SEED_COMPANY_NAME)
    .maybeSingle();
  if (existing) return existing.id;

  const { data, error } = await supabase
    .from("companies")
    .insert({ name: SEED_COMPANY_NAME })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

async function ensureRecruiter(companyId: string) {
  const { data: existingUsers } = await supabase.auth.admin.listUsers();
  let authUser = existingUsers?.users.find((u) => u.email === SEED_USER_EMAIL);

  if (!authUser) {
    const { data, error } = await supabase.auth.admin.createUser({
      email: SEED_USER_EMAIL,
      password: SEED_USER_PASSWORD,
      email_confirm: true,
    });
    if (error) throw error;
    authUser = data.user;
  } else {
    // Keep the demo credentials in .env.local authoritative. Previously an
    // existing user was reused without updating its password, which meant a
    // successful seed could still leave /login rejecting the documented
    // credentials after SEED_USER_PASSWORD changed.
    const { data, error } = await supabase.auth.admin.updateUserById(authUser.id, {
      password: SEED_USER_PASSWORD,
      email_confirm: true,
    });
    if (error) throw error;
    authUser = data.user;
  }
  if (!authUser) throw new Error("Failed to create or find seed recruiter auth user");

  const { error } = await supabase.from("users").upsert(
    {
      id: authUser.id,
      company_id: companyId,
      name: "Demo Recruiter",
      email: SEED_USER_EMAIL,
      role: "admin",
    },
    { onConflict: "id" }
  );
  if (error) throw error;

  return authUser.id;
}

async function seedJobs(companyId: string) {
  const ids: string[] = [];
  for (const job of JOB_FIXTURES) {
    const { data: existing } = await supabase
      .from("jobs")
      .select("id")
      .eq("company_id", companyId)
      .eq("title", job.title)
      .maybeSingle();

    if (existing) {
      ids.push(existing.id);
      continue;
    }

    const { data, error } = await supabase
      .from("jobs")
      .insert({ ...job, company_id: companyId })
      .select("id")
      .single();
    if (error) throw error;
    ids.push(data.id);
  }
  return ids;
}

async function seedCandidates() {
  const ids: string[] = [];
  for (const candidate of CANDIDATE_FIXTURES) {
    const { data: existing } = await supabase
      .from("candidates")
      .select("id")
      .eq("email", candidate.email)
      .maybeSingle();

    if (existing) {
      ids.push(existing.id);
      continue;
    }

    const { data, error } = await supabase
      .from("candidates")
      .insert({
        name: candidate.name,
        email: candidate.email,
        phone: candidate.phone,
        location: candidate.location,
        linkedin_url: candidate.linkedin_url,
        portfolio_url: candidate.portfolio_url,
      })
      .select("id")
      .single();
    if (error) throw error;
    ids.push(data.id);
  }
  return ids;
}

async function seedApplications(jobIds: string[], candidateIds: string[], recruiterId: string) {
  let count = 0;

  for (let i = 0; i < candidateIds.length; i++) {
    const candidateId = candidateIds[i];
    const jobId = jobIds[i % jobIds.length];
    const targetStage = STAGE_DISTRIBUTION[i % STAGE_DISTRIBUTION.length];
    const source = SOURCES[i % SOURCES.length];
    const appliedDaysAgo = 3 + i * 2;

    const { data: existing } = await supabase
      .from("applications")
      .select("id")
      .eq("candidate_id", candidateId)
      .eq("job_id", jobId)
      .maybeSingle();
    if (existing) continue;

    const { data: application, error } = await supabase
      .from("applications")
      .insert({
        candidate_id: candidateId,
        job_id: jobId,
        current_stage: targetStage,
        overall_score: scoreForStage(targetStage, i),
        source,
        applied_at: daysAgo(appliedDaysAgo),
      })
      .select("id")
      .single();
    if (error) throw error;

    const path = stagesUpTo(targetStage);
    const historyRows = path.map((stage, idx) => ({
      application_id: application.id,
      from_stage: idx === 0 ? null : path[idx - 1],
      to_stage: stage,
      changed_by: recruiterId,
      reason: idx === 0 ? "Application received" : null,
      created_at: daysAgo(appliedDaysAgo - idx),
    }));

    const { error: historyError } = await supabase.from("stage_history").insert(historyRows);
    if (historyError) throw historyError;

    count++;
  }

  return count;
}

/** Seed representative Phase 6-8 records so every dashboard module has a
 * usable starting point. External providers remain intentionally unconnected:
 * real email, calls, and Google events are only enabled by their env keys. */
async function seedAdvancedDemo(companyId: string, recruiterId: string, jobIds: string[]) {
  const { data: interviewerRows, error: interviewerLookupError } = await supabase
    .from("interviewers")
    .select("id")
    .eq("company_id", companyId)
    .eq("email", SEED_USER_EMAIL)
    .limit(1);
  if (interviewerLookupError) throw interviewerLookupError;

  let interviewerId = interviewerRows?.[0]?.id as string | undefined;
  if (!interviewerId) {
    const { data, error } = await supabase
      .from("interviewers")
      .insert({
        company_id: companyId,
        user_id: recruiterId,
        name: "Demo Recruiter",
        email: SEED_USER_EMAIL,
        timezone: "Asia/Kolkata",
        interview_types: ["Technical", "Culture Fit", "Final Round"],
        working_hours: [1, 2, 3, 4, 5].map((day_of_week) => ({ day_of_week, start: "10:00", end: "18:00" })),
      })
      .select("id")
      .single();
    if (error) throw error;
    interviewerId = data.id;
  }

  const { error: connectionError } = await supabase.from("calendar_connections").upsert(
    { interviewer_id: interviewerId, company_id: companyId, provider: "google", status: "not_connected" },
    { onConflict: "interviewer_id", ignoreDuplicates: true }
  );
  if (connectionError) throw connectionError;

  const { data: existingAssessment, error: assessmentLookupError } = await supabase
    .from("assessments")
    .select("id")
    .eq("job_id", jobIds[0])
    .eq("is_latest", true)
    .maybeSingle();
  if (assessmentLookupError) throw assessmentLookupError;

  let assessmentId = existingAssessment?.id as string | undefined;
  if (!assessmentId) {
    const { data, error } = await supabase
      .from("assessments")
      .insert({
        job_id: jobIds[0],
        created_by: recruiterId,
        title: "Technical Skills Assessment",
        description: "A complete demo assessment for testing the candidate workflow.",
        instructions: "Answer every question. Your work is autosaved.",
        type: "TECHNICAL",
        duration_minutes: 45,
        passing_score: 70,
        status: "READY",
        assessment_version: 1,
        is_latest: true,
        deadline_unit: "DAYS",
        deadline_value: 3,
      })
      .select("id")
      .single();
    if (error) throw error;
    assessmentId = data.id;
  }

  const { count: questionCount, error: questionCountError } = await supabase
    .from("assessment_questions")
    .select("id", { count: "exact", head: true })
    .eq("assessment_id", assessmentId);
  if (questionCountError) throw questionCountError;
  if (!questionCount) {
    const { error } = await supabase.from("assessment_questions").insert([
      { assessment_id: assessmentId, sequence: 1, type: "MCQ", question: "Which practice best prevents secrets from reaching a browser bundle?", points: 20, difficulty: "EASY", options: ["Store them in NEXT_PUBLIC variables", "Keep them server-only", "Put them in localStorage", "Commit them to Git"], expected_answer: "Keep them server-only", evaluation_criteria: "Selects the server-only option." },
      { assessment_id: assessmentId, sequence: 2, type: "SHORT_ANSWER", question: "Explain how you would diagnose a slow API request.", points: 30, difficulty: "MEDIUM", expected_answer: "Measure each layer, inspect logs and traces, isolate network/database/application time, then verify the fix.", evaluation_criteria: "Evidence-based, layered diagnosis with verification." },
      { assessment_id: assessmentId, sequence: 3, type: "CODING", question: "Write a function that removes duplicate strings while preserving order.", points: 50, difficulty: "MEDIUM", expected_answer: "A linear solution using a Set and ordered output.", evaluation_criteria: "Correctness, order preservation, and reasonable complexity." },
    ]);
    if (error) throw error;
  }

  const { data: applications, error: applicationsError } = await supabase
    .from("applications")
    .select("id,candidate_id")
    .order("applied_at", { ascending: false })
    .limit(2);
  if (applicationsError) throw applicationsError;

  let interviewsCreated = 0;
  for (let index = 0; index < (applications ?? []).length; index++) {
    const application = applications![index];
    const { data: existing } = await supabase
      .from("scheduled_interviews")
      .select("id")
      .eq("application_id", application.id)
      .in("status", ["PROPOSED", "CONFIRMED"])
      .limit(1)
      .maybeSingle();
    if (existing) continue;

    const start = new Date(Date.now() + (index + 2) * 24 * 60 * 60 * 1000);
    start.setHours(11 + index, 0, 0, 0);
    const end = new Date(start.getTime() + 45 * 60 * 1000);
    const { error } = await supabase.from("scheduled_interviews").insert({
      application_id: application.id,
      candidate_id: application.candidate_id,
      interviewer_id: interviewerId,
      interview_type: index === 0 ? "Technical" : "Culture Fit",
      provider: "google",
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      timezone: "Asia/Kolkata",
      status: "CONFIRMED",
      meeting_url: `https://meet.google.com/demo-${index + 1}`,
    });
    if (error) throw error;
    interviewsCreated++;
  }

  return { assessmentId, interviewerId, interviewsCreated };
}

async function main() {
  console.log(`Seeding demo data for "${SEED_COMPANY_NAME}"…`);

  const companyId = await ensureCompany();
  console.log(`Company ready: ${companyId}`);

  const recruiterId = await ensureRecruiter(companyId);
  console.log(`Recruiter ready: ${SEED_USER_EMAIL} (${recruiterId})`);

  const jobIds = await seedJobs(companyId);
  console.log(`Jobs ready: ${jobIds.length}`);

  const candidateIds = await seedCandidates();
  console.log(`Candidates ready: ${candidateIds.length}`);

  const applicationsCreated = await seedApplications(jobIds, candidateIds, recruiterId);
  console.log(`Applications created this run: ${applicationsCreated}`);

  const advanced = await seedAdvancedDemo(companyId, recruiterId, jobIds);
  console.log(`Phase 6-8 demo ready: assessment ${advanced.assessmentId}, interviewer ${advanced.interviewerId}, interviews created ${advanced.interviewsCreated}`);

  console.log("\nDone. Sign in at /login with:");
  console.log(`  email:    ${SEED_USER_EMAIL}`);
  console.log(`  password: ${SEED_USER_PASSWORD}`);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
