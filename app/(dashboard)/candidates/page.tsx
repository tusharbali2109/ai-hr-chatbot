import { createClient } from "@/lib/supabase/server";
import { listLatestRecommendations } from "@/lib/services/screening";
import { CandidatesBoard, type CandidateListItem } from "./CandidatesBoard";

export default async function CandidatesPage() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("applications")
    .select(
      "id, current_stage, overall_score, source, source_platform, applied_at, candidate:candidates(id, name, email, location), job:jobs(title)"
    )
    .order("applied_at", { ascending: false });

  if (error) throw error;

  const applicationIds = (data ?? []).map((row) => row.id as string);
  const recommendations = await listLatestRecommendations(applicationIds);

  const items: CandidateListItem[] = (data ?? []).map((row) => {
    const candidate = row.candidate as unknown as { id: string; name: string; email: string; location: string | null };
    const job = row.job as unknown as { title: string };
    return {
      applicationId: row.id,
      candidateId: candidate.id,
      name: candidate.name,
      email: candidate.email,
      location: candidate.location,
      jobTitle: job.title,
      stage: row.current_stage,
      score: row.overall_score,
      appliedAt: row.applied_at,
      source: row.source,
      sourcePlatform: row.source_platform,
      recommendation: recommendations.get(row.id)?.recommendation ?? null,
    };
  });

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Candidates</h1>
        <p className="mt-1 text-sm text-muted-foreground">{items.length} applications across all roles.</p>
      </div>

      <CandidatesBoard items={items} />
    </div>
  );
}
