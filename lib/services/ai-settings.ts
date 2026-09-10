import { createClient as createServerClient } from "@/lib/supabase/server";
import { createWebhookClient } from "@/lib/supabase/webhook-client";
import { getCurrentUserProfile } from "@/lib/services/auth";

const ROW_ID = "global";

export interface GeminiCredentials {
  /** One or more keys, tried in order — rotation happens when a key hits
   * its quota (see gemini-engine.ts). Empty when nothing is configured. */
  apiKeys: string[];
  model: string | null;
}

export interface GeminiSettingsView {
  /** Masked, one per configured key — never the raw values. */
  maskedKeys: string[];
  keyCount: number;
  hasKey: boolean;
  /** True when the keys in effect come from the GEMINI_API_KEY env var
   * because nothing has been saved in the database. */
  usingEnvFallback: boolean;
  model: string | null;
  updatedAt: string | null;
}

/** Split a stored/env value into individual keys. Accepts newline-, comma-,
 * semicolon- or whitespace-separated lists so pasting a block just works. */
export function parseKeyList(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return Array.from(
    new Set(
      raw
        .split(/[\s,;]+/)
        .map((k) => k.trim())
        .filter(Boolean)
    )
  );
}

function mask(key: string): string {
  if (key.length <= 8) return "••••";
  return `${key.slice(0, 4)}…${key.slice(-4)}`;
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

  const keys = parseKeyList(dbKey);
  return {
    apiKeys: keys.length ? keys : parseKeyList(process.env.GEMINI_API_KEY),
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

  const dbKeys = parseKeyList(data?.gemini_api_key);
  const envKeys = parseKeyList(process.env.GEMINI_API_KEY);
  const effective = dbKeys.length ? dbKeys : envKeys;

  return {
    maskedKeys: effective.map(mask),
    keyCount: effective.length,
    hasKey: effective.length > 0,
    usingEnvFallback: dbKeys.length === 0 && envKeys.length > 0,
    model: data?.gemini_model ?? process.env.GEMINI_MODEL ?? null,
    updatedAt: data?.updated_at ?? null,
  };
}

/** Save one or more Gemini keys (newline/comma separated) plus an optional
 * model override. */
export async function saveGeminiCredentials(apiKeysText: string, model: string | null): Promise<void> {
  const { userId } = await getCurrentUserProfile();
  const keys = parseKeyList(apiKeysText);
  if (keys.length === 0) throw new Error("Enter at least one Gemini API key.");

  const supabase = await createServerClient();
  const { error } = await supabase
    .from("ai_provider_settings")
    .update({ gemini_api_key: keys.join("\n"), gemini_model: model?.trim() || null, updated_by: userId })
    .eq("id", ROW_ID);
  if (error) throw error;
}

/** Clear the saved keys so the app reverts to the env var. */
export async function clearGeminiCredentials(): Promise<void> {
  const { userId } = await getCurrentUserProfile();
  const supabase = await createServerClient();
  const { error } = await supabase
    .from("ai_provider_settings")
    .update({ gemini_api_key: null, gemini_model: null, updated_by: userId })
    .eq("id", ROW_ID);
  if (error) throw error;
}
