import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * The one sanctioned exception to "no service-role key in app code" (the
 * rest of the codebase only uses it in lib/demo-data/seed.ts). Webhook
 * requests arrive with no Supabase session — proxy.ts's auth middleware
 * excludes /api/* — so there is no RLS-scoped user to act as. This client is
 * used ONLY inside app/api/webhooks/[platform]/route.ts, and only after
 * verifyWebhookRequest() has confirmed the request's signature. Never import
 * this from client/browser code or from any normal server action/service.
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
