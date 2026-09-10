import { AIServiceError } from "@/lib/ai/errors";
import type { AIEngine } from "@/lib/ai/engine";
import { readGeminiCredentialsForEngine } from "@/lib/services/ai-settings";

/**
 * Google Gemini backend, used only as an automatic fallback when the
 * Anthropic account is out of credits / rate-limited (see
 * fallback-provider.ts). Talks to the Generative Language REST API directly
 * — no SDK dependency.
 *
 * Multiple API keys can be configured (Settings → AI Providers, one per
 * line). A single call walks the list: if a key is rate-limited (429),
 * rejected (401/403) or the endpoint is briefly down (5xx), it moves to the
 * next key and only fails once every key has been tried. The last key that
 * worked is remembered so the next call starts there.
 *
 * The key list is resolved per call from the ai_provider_settings table
 * (admin-editable, rotatable live) and falls back to GEMINI_API_KEY. A 30s
 * in-memory cache avoids a DB hit on every AI call.
 *
 * Gemini's `responseSchema` accepts only a restricted OpenAPI subset that
 * our zod-derived JSON Schemas don't fit, so structured calls instead ask
 * for `application/json` output with the schema embedded in the prompt and
 * lean on the same zod parse + one retry that the Anthropic engine uses.
 */

const DEFAULT_MODEL = "gemini-3.6-flash";
const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";
const CACHE_TTL_MS = 30_000;

let cached: { apiKeys: string[]; model: string; at: number } | null = null;
/** Index into the key list to try first — set to whichever key last worked. */
let preferredKeyIndex = 0;

async function resolveConfig(): Promise<{ apiKeys: string[]; model: string }> {
  if (!cached || Date.now() - cached.at >= CACHE_TTL_MS) {
    const creds = await readGeminiCredentialsForEngine();
    cached = { apiKeys: creds.apiKeys, model: creds.model || DEFAULT_MODEL, at: Date.now() };
    if (preferredKeyIndex >= creds.apiKeys.length) preferredKeyIndex = 0;
  }
  if (cached.apiKeys.length === 0) {
    throw new AIServiceError(
      "The fallback AI provider (Gemini) is not configured. Add a Gemini API key under Settings → AI Providers, or set GEMINI_API_KEY."
    );
  }
  return { apiKeys: cached.apiKeys, model: cached.model };
}

/** Force the next call to re-read the keys — used right after an admin saves
 * new ones so the change takes effect immediately, not after the TTL. */
export function invalidateGeminiConfigCache(): void {
  cached = null;
  preferredKeyIndex = 0;
}

/** Map a Gemini HTTP failure to a safe, curated message. `multiKey` tweaks
 * the wording when every configured key has been exhausted. */
function geminiServiceError(status: number, detail: string, multiKey: boolean): AIServiceError {
  if (status === 429) {
    return new AIServiceError(
      multiKey
        ? "Every configured Gemini API key has hit its usage limit. Add more keys under Settings → AI Providers, or try again later."
        : "The fallback AI service (Gemini) has reached a usage limit. Add another Gemini API key under Settings → AI Providers, or try again later."
    );
  }
  if (status === 401 || status === 403) {
    return new AIServiceError("The Gemini API key(s) were rejected. Update them under Settings → AI Providers.");
  }
  if (status === 400 || status === 404) {
    return new AIServiceError("The fallback AI service could not accept this request. Check the Gemini model name under Settings → AI Providers.");
  }
  console.error("Gemini request failed", status, detail);
  return new AIServiceError("The fallback AI service is temporarily unavailable. Please try again later.");
}

/** A key-level failure worth moving on to the next key for. */
function shouldRotate(status: number): boolean {
  return status === 429 || status === 401 || status === 403 || status === 500 || status === 503;
}

interface GeminiPart { text?: string }
interface GeminiResponse {
  candidates?: { content?: { parts?: GeminiPart[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
}

async function generate(system: string, userPrompt: string, json: boolean): Promise<string> {
  const { apiKeys, model } = await resolveConfig();
  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: "user", parts: [{ text: userPrompt }] }],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: json ? 4096 : 1024,
      ...(json ? { responseMimeType: "application/json" } : {}),
    },
  });

  let lastStatus = 0;
  let lastDetail = "";

  for (let attempt = 0; attempt < apiKeys.length; attempt++) {
    const keyIndex = (preferredKeyIndex + attempt) % apiKeys.length;
    const apiKey = apiKeys[keyIndex];

    let res: Response;
    try {
      res = await fetch(`${ENDPOINT}/${model}:generateContent?key=${apiKey}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
      });
    } catch (err) {
      console.error(`Gemini network error (key ${keyIndex + 1}/${apiKeys.length})`, err);
      lastStatus = 0;
      lastDetail = "network error";
      continue;
    }

    if (res.ok) {
      preferredKeyIndex = keyIndex; // stick with the key that worked
      const data = (await res.json()) as GeminiResponse;
      if (data.promptFeedback?.blockReason) {
        throw new Error(`The AI declined to process this request (${data.promptFeedback.blockReason}). Please rephrase and try again.`);
      }
      const candidate = data.candidates?.[0];
      const text = (candidate?.content?.parts ?? []).map((p) => p.text ?? "").join("").trim();
      if (!text) {
        if (candidate?.finishReason && candidate.finishReason !== "STOP") {
          throw new Error(`AI response ended unexpectedly (${candidate.finishReason}).`);
        }
        throw new Error("AI response contained no text output.");
      }
      return text;
    }

    lastStatus = res.status;
    lastDetail = await res.text().catch(() => "");

    if (!shouldRotate(res.status)) {
      // 400 / 404 etc. — a request/model problem every key would share.
      throw geminiServiceError(res.status, lastDetail, apiKeys.length > 1);
    }
    console.warn(`Gemini key ${keyIndex + 1}/${apiKeys.length} failed with ${res.status}; trying next key`);
  }

  if (lastStatus === 0) {
    throw new AIServiceError("The fallback AI service could not be reached. Please try again later.");
  }
  throw geminiServiceError(lastStatus, lastDetail, apiKeys.length > 1);
}

/** Strip a ```json … ``` fence if the model added one despite JSON mode. */
function stripFence(text: string): string {
  const fence = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  return fence ? fence[1].trim() : text;
}

async function callStructured<T>(
  system: string,
  userPrompt: string,
  jsonSchema: object,
  parse: (raw: unknown) => T,
  retries = 1
): Promise<T> {
  const structuredSystem = `${system}

Respond with ONLY a single JSON object — no prose, no markdown fences, no explanation. It MUST validate against this JSON Schema:
${JSON.stringify(jsonSchema)}`;

  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const text = stripFence(await generate(structuredSystem, userPrompt, true));
      return parse(JSON.parse(text));
    } catch (err) {
      // A transport/quota failure is already an AIServiceError — surface it
      // rather than burning the retry on it as if it were bad JSON.
      if (err instanceof AIServiceError) throw err;
      lastError = err;
    }
  }

  console.error("Gemini output validation failed", lastError);
  throw new AIServiceError("The fallback AI returned an unreadable response. Please retry.");
}

async function callText(system: string, userPrompt: string): Promise<string> {
  return generate(system, userPrompt, false);
}

export const geminiEngine: AIEngine = { label: "Gemini", callStructured, callText };
