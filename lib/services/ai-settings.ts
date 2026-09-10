import { createClient as createServerClient } from "@/lib/supabase/server";
import { createWebhookClient } from "@/lib/supabase/webhook-client";
import { getCurrentUserProfile } from "@/lib/services/auth";

const ROW_ID = "global";

export interface GeminiCredentials {
  apiKey: string | null;
  model: string | null;
}

export interface GeminiSettingsView {
  /** Masked for display — never the raw key. */
  maskedKey: string | null;
  hasKey: boolean;
  /** True when the key in effect comes from the GEMINI_API_KEY env var
   * because no key has been saved in the database. */
  usingEnvFallback: boolean;
  model: string | null;
  updatedAt: string | null;
}

function mask(key: string): string {
  const trimmed = key.trim();
  if (trimmed.length <= 8) return "••••";
  return `${trimmed.slice(0, 4)}…${trimmed.slice(-4)}`;
}

/**
 * Reads the effective Gemini credentials for the AI engine. Uses the
 * service-role client because AI calls also run in webhook / phone-interview
 * contexts that have no user session (sanctioned reason #1 in
 * lib/supabase/webhook-client.ts). Database value wins; the GEMINI_API_KEY
 * env var is the fallback when nothing is saved.
 */
export async function readGeminiCredentialsForEngine(): Promise<GeminiCredentials> {
  let dbKey: string | null = null;
  let dbModel: string | null = null;
  try {
    const supabase = createWebhookClient();
    const { data, error } = await supabase
      .from("ai_provider_settings")
      .select("gemini_api_key, gemini_model")
      .eq("id", ROW_ID)
      .maybeSingle();
    if (error) throw error;
    dbKey = data?.gemini_api_key ?? null;
    dbModel = data?.gemini_model ?? null;
  } catch (err) {
    // A missing table (migration not yet run) or transient DB error must
    // not take the fallback provider down — degrade to the env var.
    console.error("[ai] could not read ai_provider_settings; using GEMINI_API_KEY env", err);
  }

  return {
    apiKey: dbKey || process.env.GEMINI_API_KEY || null,
    model: dbModel || process.env.GEMINI_MODEL || null,
  };
}

/** The masked current state for the Settings page. Any signed-in platform
 * user (not candidates) — enforced again by RLS. */
export async function getGeminiSettingsView(): Promise<GeminiSettingsView> {
  await getCurrentUserProfile();
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("ai_provider_settings")
    .select("gemini_api_key, gemini_model, updated_at")
    .eq("id", ROW_ID)
    .maybeSingle();
  if (error) throw error;

  const dbKey = data?.gemini_api_key ?? null;
  const envKey = process.env.GEMINI_API_KEY ?? null;
  const effective = dbKey || envKey;

  return {
    maskedKey: effective ? mask(effective) : null,
    hasKey: !!effective,
    usingEnvFallback: !dbKey && !!envKey,
    model: data?.gemini_model ?? process.env.GEMINI_MODEL ?? null,
    updatedAt: data?.updated_at ?? null,
  };
}

/** Save a new Gemini key (and optional model override). */
export async function saveGeminiCredentials(apiKey: string, model: string | null): Promise<void> {
  const { userId } = await getCurrentUserProfile();
  const trimmedKey = apiKey.trim();
  if (!trimmedKey) throw new Error("Enter a Gemini API key.");

  const supabase = await createServerClient();
  const { error } = await supabase
    .from("ai_provider_settings")
    .update({ gemini_api_key: trimmedKey, gemini_model: model?.trim() || null, updated_by: userId })
    .eq("id", ROW_ID);
  if (error) throw error;
}

/** Clear the saved key so the app reverts to the env var. */
export async function clearGeminiCredentials(): Promise<void> {
  const { userId } = await getCurrentUserProfile();
  const supabase = await createServerClient();
  const { error } = await supabase
    .from("ai_provider_settings")
    .update({ gemini_api_key: null, gemini_model: null, updated_by: userId })
    .eq("id", ROW_ID);
  if (error) throw error;
}
