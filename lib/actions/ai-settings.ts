"use server";

import { revalidatePath } from "next/cache";
import { saveGeminiCredentials, clearGeminiCredentials } from "@/lib/services/ai-settings";
import { invalidateGeminiConfigCache } from "@/lib/ai/gemini-engine";

/** Save one or more Gemini fallback keys (newline/comma separated) plus an
 * optional model override, then drop the engine's cache so it takes effect
 * on the next AI call. */
export async function updateGeminiKeyAction(apiKeysText: string, model: string | null): Promise<void> {
  await saveGeminiCredentials(apiKeysText, model);
  invalidateGeminiConfigCache();
  revalidatePath("/settings");
}

/** Remove the saved keys so the app reverts to GEMINI_API_KEY. */
export async function clearGeminiKeyAction(): Promise<void> {
  await clearGeminiCredentials();
  invalidateGeminiConfigCache();
  revalidatePath("/settings");
}
