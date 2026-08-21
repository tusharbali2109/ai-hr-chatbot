"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAuthedCompanyId, assertJobOwnership } from "@/lib/services/jd";
import { requireAdmin } from "@/lib/services/auth";

/** Admin-only. Deleting the `jobs` row cascades to `applications` (and,
 * transitively, everything owned by an application) via the `on delete
 * cascade` FK from supabase/migrations/0001_init.sql, plus every
 * job-scoped table added in later migrations (job_jd_versions,
 * job_postings, assessments, ...), all of which reference jobs(id) with
 * the same cascade. */
export async function deleteJobAction(jobId: string): Promise<void> {
  await requireAdmin();

  const { companyId } = await getAuthedCompanyId();
  await assertJobOwnership(jobId, companyId);

  const supabase = await createClient();
  const { error } = await supabase.from("jobs").delete().eq("id", jobId);
  if (error) throw error;

  revalidatePath("/jobs");
}
