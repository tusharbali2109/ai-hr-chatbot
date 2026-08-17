import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";
import type { Company } from "@/lib/types/database";

export async function getCompany(id: string, client?: SupabaseClient): Promise<Company | null> {
  const supabase = client ?? ((await createServerClient()) as unknown as SupabaseClient);
  const { data, error } = await supabase.from("companies").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data as Company | null;
}
