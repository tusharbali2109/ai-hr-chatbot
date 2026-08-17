import { NextResponse } from "next/server";
import { verifyWebhookRequest } from "@/lib/webhooks/signature";
import { createWebhookClient } from "@/lib/supabase/webhook-client";
import { isEventProcessed, recordEvent, markEventProcessed, markEventFailed } from "@/lib/services/webhooks";
import { ingestApplicant } from "@/lib/services/ingestion";

/**
 * Generic webhook receiver for every job board connector. Outside
 * proxy.ts's auth matcher (which excludes /api/*), so this route is
 * self-verifying: it never processes anything until the connector's own
 * verifyWebhookSignature() confirms the request is authentic.
 *
 * Expected JSON body shape (connector-defined, kept generic here):
 *   { event_id: string, event_type: string, external_job_id: string, applicant: object }
 */
export async function POST(request: Request, { params }: { params: Promise<{ platform: string }> }) {
  const { platform } = await params;
  const rawBody = await request.text();
  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    headers[key] = value;
  });

  const verified = await verifyWebhookRequest(platform, rawBody, headers);
  if (!verified) {
    return NextResponse.json({ error: "Invalid webhook signature." }, { status: 401 });
  }

  let body: { event_id?: string; event_type?: string; external_job_id?: string; applicant?: Record<string, unknown> };
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Malformed JSON payload." }, { status: 400 });
  }

  const externalEventId = body.event_id;
  const externalJobId = body.external_job_id;
  if (!externalEventId || !externalJobId || !body.applicant) {
    return NextResponse.json({ error: "Missing required webhook fields." }, { status: 400 });
  }

  const supabase = createWebhookClient();

  const { data: posting, error: postingError } = await supabase
    .from("job_postings")
    .select("id, job_id")
    .eq("platform", platform)
    .eq("external_job_id", externalJobId)
    .maybeSingle();
  if (postingError) {
    return NextResponse.json({ error: "Failed to resolve job posting." }, { status: 500 });
  }
  if (!posting) {
    // Nothing to attach this event to — still return 200 so the platform
    // doesn't hammer retries for a permanent mismatch; the event is simply
    // not recorded since it can't be scoped to a company via job_posting_id.
    return NextResponse.json({ received: true, resolved: false });
  }

  const alreadyProcessed = await isEventProcessed(supabase, platform, externalEventId);
  if (alreadyProcessed) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  const event = await recordEvent(supabase, {
    platform,
    externalEventId,
    eventType: body.event_type ?? "application.created",
    jobPostingId: posting.id,
    payload: body,
  });

  try {
    await ingestApplicant(body.applicant, platform, posting.job_id, supabase);
    await markEventProcessed(supabase, event.id);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown ingestion error.";
    await markEventFailed(supabase, event.id, message);
  }

  // Always 200 once durably recorded — processing failures live in
  // external_events.error, not the HTTP response, so the platform doesn't
  // hammer retries for a permanent failure.
  return NextResponse.json({ received: true });
}
