export interface VoiceProviderCapabilities {
  supportsRecording: boolean;
  /** True for providers whose webhooks require a publicly reachable HTTPS
   * URL (real telephony providers) — used by the UI/checklist to warn when
   * that isn't configured, mirroring JobBoardCapabilities' honesty pattern. */
  requiresPublicWebhook: boolean;
}

export interface CreateCallInput {
  interviewId: string;
  toPhoneE164: string;
  recordingEnabled: boolean;
}

export interface CreateCallResult {
  externalCallId: string;
  status: string;
  /** True only for a provider whose entire call completes within this one
   * function call (MockVoiceProvider). Real providers (Twilio) return
   * almost immediately after the call is accepted — completion arrives
   * later via webhook, never from this return value. */
  completedSynchronously: boolean;
}

export interface CallStatusResult {
  status: string;
  durationSeconds: number | null;
}

export interface VoiceTranscriptTurn {
  speaker: "AI" | "CANDIDATE";
  text: string;
}

/**
 * Generic contract every voice/telephony integration implements.
 * Provider-specific API details live only inside a provider's own file —
 * nothing else in the app (agent, services, actions, UI) knows how any
 * particular provider works.
 */
export interface VoiceProvider {
  readonly name: string;
  readonly capabilities: VoiceProviderCapabilities;

  createOutboundCall(input: CreateCallInput): Promise<CreateCallResult>;
  endCall(externalCallId: string): Promise<void>;
  getCallStatus(externalCallId: string): Promise<CallStatusResult>;
  getTranscript(externalCallId: string): Promise<VoiceTranscriptTurn[]>;
}

export class VoiceProviderNotConfiguredError extends Error {
  constructor(provider: string) {
    super(`Integration not configured: ${provider} has no valid credentials for this environment.`);
    this.name = "VoiceProviderNotConfiguredError";
  }
}
