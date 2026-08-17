import Twilio from "twilio";
import type {
  VoiceProvider,
  VoiceProviderCapabilities,
  CreateCallInput,
  CreateCallResult,
  CallStatusResult,
  VoiceTranscriptTurn,
} from "@/lib/interview/voice-provider";
import { VoiceProviderNotConfiguredError } from "@/lib/interview/voice-provider";

/**
 * Real Twilio voice integration — uses Twilio's documented REST API
 * (`calls.create`) and TwiML (built by the webhook route, not here) for the
 * live conversation. Genuinely untested in this environment: no
 * TWILIO_ACCOUNT_SID/AUTH_TOKEN/PHONE_NUMBER are configured here, and even
 * once they are, Twilio's webhooks require a publicly reachable HTTPS URL
 * (TWILIO_VOICE_WEBHOOK_BASE_URL) that a bare local/sandboxed dev server
 * doesn't have — see the Phase 5 plan's verification notes.
 *
 * Speech-to-text uses Twilio's built-in `<Gather input="speech">`
 * recognition (configured in the webhook route's TwiML) — no separate
 * Deepgram integration.
 */
class TwilioVoiceProvider implements VoiceProvider {
  readonly name = "twilio";

  readonly capabilities: VoiceProviderCapabilities = {
    supportsRecording: true,
    requiresPublicWebhook: true,
  };

  private client() {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    if (!accountSid || !authToken) {
      throw new VoiceProviderNotConfiguredError("twilio");
    }
    return Twilio(accountSid, authToken);
  }

  private webhookBaseUrl(): string {
    const base = process.env.TWILIO_VOICE_WEBHOOK_BASE_URL;
    if (!base) {
      throw new VoiceProviderNotConfiguredError(
        "twilio (TWILIO_VOICE_WEBHOOK_BASE_URL is required — Twilio must be able to reach a public URL for call webhooks)"
      );
    }
    return base.replace(/\/$/, "");
  }

  async createOutboundCall(input: CreateCallInput): Promise<CreateCallResult> {
    const fromNumber = process.env.TWILIO_PHONE_NUMBER;
    if (!fromNumber) {
      throw new VoiceProviderNotConfiguredError("twilio (TWILIO_PHONE_NUMBER)");
    }
    const base = this.webhookBaseUrl();

    const call = await this.client().calls.create({
      to: input.toPhoneE164,
      from: fromNumber,
      url: `${base}/api/webhooks/twilio/voice`,
      statusCallback: `${base}/api/webhooks/twilio/status`,
      statusCallbackEvent: ["completed", "no-answer", "busy", "failed"],
      statusCallbackMethod: "POST",
      record: input.recordingEnabled,
    });

    return { externalCallId: call.sid, status: call.status, completedSynchronously: false };
  }

  async endCall(externalCallId: string): Promise<void> {
    await this.client().calls(externalCallId).update({ status: "completed" });
  }

  async getCallStatus(externalCallId: string): Promise<CallStatusResult> {
    const call = await this.client().calls(externalCallId).fetch();
    return { status: call.status, durationSeconds: call.duration ? Number(call.duration) : null };
  }

  async getTranscript(): Promise<VoiceTranscriptTurn[]> {
    // Twilio doesn't retroactively hand back a full transcript beyond what
    // <Gather> already delivered turn-by-turn (persisted to our own DB by
    // the voice webhook route as it happens) — this exists for interface
    // parity, not as the load-bearing transcript source.
    return [];
  }
}

export const twilioVoiceProvider = new TwilioVoiceProvider();
