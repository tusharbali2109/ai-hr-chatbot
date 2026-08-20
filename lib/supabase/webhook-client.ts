import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * A sanctioned exception to "no service-role key in app code" (the rest of
 * the codebase only uses it in lib/demo-data/seed.ts). Three legitimate
 * reasons a call site uses this instead of the normal session-bound client:
 *   1. No session exists at all — proxy.ts's auth middleware excludes
 *      /api/* (job-board/Twilio webhooks).
 *   2. The caller is deliberately unauthenticated by design (the public
 *      careers apply route, app/api/careers/apply/route.ts).
 *   3. A candidate DOES have a real, RLS-scoped session (used for the
 *      ownership check and any writes to their own candidate-RLS-covered
 *      rows), but the same request also needs to touch recruiter-only
 *      tables with no candidate RLS policy at all — applications,
 *      stage_history, agent_runs — e.g. the assessment submit route
 *      (app/api/assessment/[assignmentId]/submit/route.ts) and the
 *      candidate video-interview actions (lib/actions/candidate-interview.ts).
 *      In this case the candidate-session client still does the ownership
 *      check; only the recruiter-table write switches to this client.
 * Every call site must justify which of the three applies. Never import
 * this from client/browser code or from any normal server action/service
 * outside these narrow, justified cases.
 */
export function createWebhookClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error("Webhook processing is not configured: missing Supabase service-role credentials.");
  }

  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
