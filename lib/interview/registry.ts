import type { VoiceProvider } from "@/lib/interview/voice-provider";
import { mockVoiceProvider } from "@/lib/interview/voice-providers/mock";
import { twilioVoiceProvider } from "@/lib/interview/voice-providers/twilio";

const providers: Record<string, VoiceProvider> = {
  mock: mockVoiceProvider,
  twilio: twilioVoiceProvider,
};

/**
 * Which provider is actually used is controlled by VOICE_PROVIDER, defaulting
 * to 'mock' so nothing ever places a real phone call until this is
 * explicitly set to 'twilio' AND Twilio credentials are configured — two
 * independent gates, both default-safe. To add a real provider later:
 * implement VoiceProvider in lib/interview/voice-providers/<name>.ts and
 * register it in the map above. Nothing else needs to change.
 */
export function getVoiceProvider(): VoiceProvider {
  const name = (process.env.VOICE_PROVIDER ?? "mock").toLowerCase();
  return providers[name] ?? mockVoiceProvider;
}

export function listVoiceProviders(): VoiceProvider[] {
  return Object.values(providers);
}
