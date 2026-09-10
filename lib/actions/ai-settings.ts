"use server";

import { revalidatePath } from "next/cache";
import { saveGeminiCredentials, clearGeminiCredentials } from "@/lib/services/ai-settings";
import { invalidateGeminiConfigCache } from "@/lib/ai/gemini-engine";

/** Admin-only. Save a new Gemini fallback key (and optional model override),
 * then drop the engine's cache so it takes effect on the next AI call. */
export async function updateGeminiKeyAction(apiKey: string, model: string | null): Promise<void> {
  await saveGeminiCredentials(apiKey, model);
  invalidateGeminiConfigCache();
  revalidatePath("/settings");
}

/** Admin-only. Remove the saved key so the app reverts to GEMINI_API_KEY. */
export async function clearGeminiKeyAction(): Promise<void> {
  await clearGeminiCredentials();
  invalidateGeminiConfigCache();
  revalidatePath("/settings");
}
