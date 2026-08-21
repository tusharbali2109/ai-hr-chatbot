import { createClient } from "@/lib/supabase/server";

/** The three roles the `users` table actually allows (see the `check`
 * constraint in supabase/migrations/0001_init.sql) — a narrower set than
 * lib/types/database.ts's UserRole, which also lists roles no signup flow
 * ever assigns. Kept separate so role-gating logic here can't silently
 * accept a role the DB would never store. */
export type AppUserRole = "admin" | "recruiter" | "hiring_manager";

export interface CurrentUserProfile {
  userId: string;
  companyId: string;
  role: AppUserRole;
  email: string;
}

/** Resolves the signed-in recruiter's app-level profile (company, role).
 * Throws if there's no session or no matching `users` row — callers that
 * need to distinguish "not signed in" from "not authorized" should catch
 * and re-throw with their own message. */
export async function getCurrentUserProfile(): Promise<CurrentUserProfile> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: profile, error } = await supabase
    .from("users")
    .select("company_id, role, email")
    .eq("id", user.id)
    .single();
  if (error) throw error;

  return {
    userId: user.id,
    companyId: profile.company_id,
    role: profile.role as AppUserRole,
    email: profile.email,
  };
}

/** Guard for admin-only server actions (e.g. deleting a candidate or a
 * job). Call at the top of the action, before any mutation — this is the
 * real enforcement boundary; client-side button hiding is just UX, since a
 * non-admin could otherwise still invoke the server action directly. */
export async function requireAdmin(): Promise<CurrentUserProfile> {
  const profile = await getCurrentUserProfile();
  if (profile.role !== "admin") {
    throw new Error("This action is restricted to administrators.");
  }
  return profile;
}
