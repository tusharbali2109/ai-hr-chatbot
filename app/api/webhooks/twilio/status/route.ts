import { NextResponse } from "next/server";
import { verifyTwilioSignature } from "@/lib/interview/twilio-signature";
import { createWebhookClient } from "@/lib/supabase/webhook-client";
import { isEventProcessed, recordEvent, markEventProcessed, markEventFailed } from "@/lib/services/webhooks";
import { getInterviewByExternalCallId, updateInterview } from "@/lib/services/interviews";
import { updateApplicationStage } from "@/lib/services/applications";
import { markAgentRunCompleted } from "@/lib/services/agent-runs";
import { logInternalEvent } from "@/lib/services/ingestion";
import type { InterviewStatus } from "@/lib/types/database";
import type { RecruitmentStage } from "@/lib/stages";

/**
 * Call-lifecycle callbacks (completed/no-answer/busy/failed/canceled).
 * Genuinely untested in this environment — written against Twilio's real,
 * documented statusCallback contract. Reuses the same idempotency machinery
 * (external_events) as Phase 3's job-board webhooks, since Twilio can retry
 * status callback delivery.
 */

const FAILURE_STATUS_MAP: Record<string, InterviewStatus> = {
  "no-answer": "NO_ANSWER",
  busy: "BUSY",
  failed: "CALL_FAILED",
  canceled: "CALL_FAILED",
};

function mapInterviewStatusToStage(status: InterviewStatus, recommendation: string | null): RecruitmentStage {
  if (status === "COMPLETED") {
    if (recommendation === "INTERVIEW_SHORTLISTED") return "INTERVIEW_SHORTLISTED";
    if (recommendation === "REJECTED") return "REJECTED";
    return "NEEDS_REVIEW";
  }
  // NO_ANSWER / BUSY / CALL_FAILED / NETWORK_ERROR / PROVIDER_ERROR /
  // CANDIDATE_DISCONNECTED / CONSENT_DECLINED / NEEDS_REVIEW: never
  // auto-reject on a technical or consent outcome — stays at AI_INTERVIEW
  // for the recruiter to retry or handle manually.
  return "AI_INTERVIEW";
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const params = Object.fromEntries(new URLSearchParams(rawBody));
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const base = process.env.TWILIO_VOICE_WEBHOOK_BASE_URL;

  if (!authToken || !base) {
    return NextResponse.json({ error: "Twilio is not configured." }, { status: 500 });
  }

  const webhookUrl = `${base.replace(/\/$/, "")}/api/webhooks/twilio/status`;
  const signature = request.headers.get("x-twilio-signature");
  if (!verifyTwilioSignature(webhookUrl, params, signature, authToken)) {
    return NextResponse.json({ error: "Invalid Twilio signature." }, { status: 401 });
  }

  const callSid = params.CallSid;
  const callStatus = params.CallStatus;
  if (!callSid || !callStatus) {
    return NextResponse.json({ error: "Missing CallSid or CallStatus." }, { status: 400 });
  }

  const supabase = createWebhookClient();
  const externalEventId = `${callSid}:${callStatus}`;

  const alreadyProcessed = await isEventProcessed(supabase, "twilio", externalEventId);
  if (alreadyProcessed) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  const event = await recordEvent(supabase, {
    platform: "twilio",
    externalEventId,
    eventType: `call.${callStatus}`,
    jobPostingId: null,
    payload: params,
  });

  try {
    const interview = await getInterviewByExternalCallId(callSid, supabase);
    if (!interview) {
      await markEventProcessed(supabase, event.id);
      return NextResponse.json({ received: true, resolved: false });
    }

    // If the voice route's conversation loop already finalized this
    // interview (COMPLETED with a recommendation), this callback just
    // confirms the call ended — only the "outer" application-level
    // bookkeeping below still needs to run, exactly once.
    const alreadyFinalized = interview.status === "COMPLETED" && interview.recommendation != null;

    if (!alreadyFinalized) {
      const mappedStatus: InterviewStatus =
        callStatus === "completed" ? "NEEDS_REVIEW" : (FAILURE_STATUS_MAP[callStatus] ?? "PROVIDER_ERROR");
      await updateInterview(
        interview.id,
        {
          status: mappedStatus,
          ended_at: new Date().toISOString(),
          duration_seconds: params.CallDuration ? Number(params.CallDuration) : null,
        },
        supabase
      );
    }

    const finalInterview = await getInterviewByExternalCallId(callSid, supabase);
    if (!finalInterview) throw new Error("Interview disappeared during status processing.");

    if (finalInterview.agent_run_id) {
      await markAgentRunCompleted(
        finalInterview.agent_run_id,
        { interview_id: finalInterview.id, recommendation: finalInterview.recommendation, overall_score: finalInterview.overall_score },
        supabase
      );
    }

    const targetStage = mapInterviewStatusToStage(finalInterview.status, finalInterview.recommendation);
    await updateApplicationStage(
      finalInterview.application_id,
      "AI_INTERVIEW",
      targetStage,
      `AI interview ${finalInterview.status.toLowerCase().replace("_", " ")}`,
      { source: "interview", decision_source: "AI", interview_id: finalInterview.id },
      supabase
    );

    if (targetStage !== "AI_INTERVIEW") {
      await logInternalEvent(
        "candidate.interview.completed",
        {
          application_id: finalInterview.application_id,
          payload: {
            recommendation: finalInterview.recommendation,
            overall_score: finalInterview.overall_score,
            status: finalInterview.status,
          },
        },
        supabase
      );
    }

    await markEventProcessed(supabase, event.id);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error processing Twilio status callback.";
    await markEventFailed(supabase, event.id, message);
  }

  // Always 200 once durably recorded, same convention as the job-board
  // webhook — errors live in external_events.error, not the HTTP response.
  return NextResponse.json({ received: true });
}
