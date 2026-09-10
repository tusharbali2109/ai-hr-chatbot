import { AIServiceError } from "@/lib/ai/errors";
import { VoiceProviderNotConfiguredError } from "@/lib/interview/voice-provider";

export class UserFacingError extends Error {}
export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };
export async function actionResult<T>(work: () => Promise<T>): Promise<ActionResult<T>> {
  try { return { ok: true, data: await work() }; }
  catch (error) {
    if (error instanceof AIServiceError || error instanceof UserFacingError || error instanceof VoiceProviderNotConfiguredError) {
      return { ok: false, error: error.message };
    }
    console.error("Server action failed", error);
    return { ok: false, error: "This action could not be completed. Check your session and integration settings, then retry." };
  }
}
