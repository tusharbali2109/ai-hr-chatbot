import { getConnector } from "@/lib/jobboards/registry";

/**
 * Looks up the platform's connector and delegates signature verification to
 * it — the webhook route stays generic with no per-platform branching.
 * Returns false (never throws) for an unknown platform so the route can
 * uniformly reject with 401.
 */
export async function verifyWebhookRequest(
  platform: string,
  rawBody: string,
  headers: Record<string, string>
): Promise<boolean> {
  const connector = getConnector(platform);
  if (!connector) return false;
  return connector.verifyWebhookSignature(rawBody, headers);
}
