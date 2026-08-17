import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getAuthedCompanyId, assertJobOwnership } from "@/lib/services/jd";
import { computeNextVersionNumber } from "@/lib/jd/logic";
import type {
  Screening,
  ScreeningRequirement,
  ScreeningRecommendation,
  ScreeningConfidence,
  ComponentScores,
  RequirementType,
  RequirementStatus,
} from "@/lib/types/database";

export interface ScreeningWithRequirements extends Screening {
  requirements: ScreeningRequirement[];
}

/** Optional client param — the FinalEvaluationAgent may run from a
 * service-role context (e.g. auto-triggered from the assessment-submit
 * route, which has no recruiter session) and must pass that client
 * explicitly, same pattern used throughout lib/services. */
export async function getLatestScreening(applicationId: string, client?: SupabaseClient): Promise<ScreeningWithRequirements | null> {
  const supabase = client ?? (await createClient());
  const { data: screening, error } = await supabase
    .from("screenings")
    .select("*")
    .eq("application_id", applicationId)
    .eq("is_latest", true)
    .maybeSingle();
  if (error) throw error;
  if (!screening) return null;

  const { data: requirements, error: reqError } = await supabase
    .from("screening_requirements")
    .select("*")
    .eq("screening_id", screening.id)
    .order("created_at", { ascending: true });
  if (reqError) throw reqError;

  return { ...(screening as Screening), requirements: (requirements ?? []) as ScreeningRequirement[] };
}

export async function listScreeningsForApplication(applicationId: string): Promise<Screening[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("screenings")
    .select("*")
    .eq("application_id", applicationId)
    .order("screening_version", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Screening[];
}

export interface CreateScreeningRequirementInput {
  requirement_type: RequirementType;
  requirement: string;
  status: RequirementStatus;
  score: number | null;
  evidence: string;
}

export interface CreateScreeningInput {
  applicationId: string;
  agentRunId: string | null;
  jdVersionId: string | null;
  status: "COMPLETED" | "FAILED";
  overallScore: number | null;
  recommendation: ScreeningRecommendation | null;
  confidence: ScreeningConfidence | null;
  summary: string | null;
  strengths: string[];
  gaps: string[];
  concerns: string[];
  componentScores: Partial<ComponentScores>;
  scoringWeights: Partial<ComponentScores>;
  modelName: string | null;
  modelVersion: string | null;
  requirements: CreateScreeningRequirementInput[];
}

/** Never overwrites history — flips the prior "latest" row, inserts a new
 * versioned screening + its requirement rows in one call. */
export async function createScreening(input: CreateScreeningInput): Promise<ScreeningWithRequirements> {
  const supabase = await createClient();

  const { data: latest, error: latestError } = await supabase
    .from("screenings")
    .select("screening_version")
    .eq("application_id", input.applicationId)
    .order("screening_version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latestError) throw latestError;

  const nextVersion = computeNextVersionNumber(latest?.screening_version);

  const { error: unflagError } = await supabase
    .from("screenings")
    .update({ is_latest: false })
    .eq("application_id", input.applicationId)
    .eq("is_latest", true);
  if (unflagError) throw unflagError;

  const { data: screening, error: insertError } = await supabase
    .from("screenings")
    .insert({
      application_id: input.applicationId,
      agent_run_id: input.agentRunId,
      jd_version_id: input.jdVersionId,
      screening_version: nextVersion,
      status: input.status,
      overall_score: input.overallScore,
      recommendation: input.recommendation,
      confidence: input.confidence,
      summary: input.summary,
      strengths: input.strengths,
      gaps: input.gaps,
      concerns: input.concerns,
      component_scores: input.componentScores,
      scoring_weights: input.scoringWeights,
      is_latest: true,
      model_name: input.modelName,
      model_version: input.modelVersion,
    })
    .select("*")
    .single();
  if (insertError) throw insertError;

  let requirements: ScreeningRequirement[] = [];
  if (input.requirements.length > 0) {
    const { data: reqRows, error: reqError } = await supabase
      .from("screening_requirements")
      .insert(input.requirements.map((r) => ({ ...r, screening_id: screening.id })))
      .select("*");
    if (reqError) throw reqError;
    requirements = (reqRows ?? []) as ScreeningRequirement[];
  }

  return { ...(screening as Screening), requirements };
}

/** Batched lookup (not N+1) of the latest recommendation per application id
 * — feeds the AI-recommendation column in candidate/application tables. */
export async function listLatestRecommendations(
  applicationIds: string[]
): Promise<Map<string, { recommendation: ScreeningRecommendation | null; overallScore: number | null }>> {
  const map = new Map<string, { recommendation: ScreeningRecommendation | null; overallScore: number | null }>();
  if (applicationIds.length === 0) return map;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("screenings")
    .select("application_id, recommendation, overall_score")
    .in("application_id", applicationIds)
    .eq("is_latest", true);
  if (error) throw error;

  for (const row of data ?? []) {
    map.set(row.application_id as string, {
      recommendation: row.recommendation as ScreeningRecommendation | null,
      overallScore: row.overall_score as number | null,
    });
  }
  return map;
}

/** Applications sitting in AI_SCREENING (or freshly APPLIED) with no active
 * run — the candidate pool a "Run Screening" batch modal offers. */
export async function listPendingScreeningApplications(jobId: string): Promise<{ id: string; current_stage: string }[]> {
  const { companyId } = await getAuthedCompanyId();
  await assertJobOwnership(jobId, companyId);
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("applications")
    .select("id, current_stage")
    .eq("job_id", jobId)
    .in("current_stage", ["APPLIED", "AI_SCREENING"]);
  if (error) throw error;
  return (data ?? []) as { id: string; current_stage: string }[];
}
