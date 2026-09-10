import { AIServiceError } from "@/lib/ai/errors";
import type { AIEngine } from "@/lib/ai/engine";
import { readGeminiCredentialsForEngine } from "@/lib/services/ai-settings";

/**
 * Google Gemini backend, used only as an automatic fallback when the
 * Anthropic account is out of credits / rate-limited (see
 * fallback-provider.ts). Talks to the Generative Language REST API directly
 * — no SDK dependency.
 *
 * The API key is resolved at call time from ai_provider_settings in the
 * database (admin-editable in the Settings UI, so it can be rotated live
 * when the Gemini quota runs out) and falls back to the GEMINI_API_KEY env
 * var. Resolved values are cached briefly so a burst of AI calls doesn't
 * hit the database on every one.
 *
 * Gemini's `responseSchema` accepts only a restricted OpenAPI subset that
 * our zod-derived JSON Schemas don't fit, so structured calls instead ask
 * for `application/json` output with the schema embedded in the prompt and
 * lean on the same zod parse + one retry that the Anthropic engine uses.
 */

const DEFAULT_MODEL = "gemini-3.6-flash";
const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";
const CACHE_TTL_MS = 30_000;

let cached: { apiKey: string | null; model: string; at: number } | null = null;

async function resolveConfig(): Promise<{ apiKey: string; model: string }> {
  if (!cached || Date.now() - cached.at >= CACHE_TTL_MS) {
    const creds = await readGeminiCredentialsForEngine();
    cached = { apiKey: creds.apiKey, model: creds.model || DEFAULT_MODEL, at: Date.now() };
  }
  if (!cached.apiKey) {
    throw new AIServiceError(
      "The fallback AI provider (Gemini) is not configured. Add a Gemini API key under Settings → AI Providers, or set GEMINI_API_KEY."
    );
  }
  return { apiKey: cached.apiKey, model: cached.model };
}

/** Force the next call to re-read the key — used right after an admin saves
 * a new one so the change takes effect immediately, not after the TTL. */
export function invalidateGeminiConfigCache(): void {
  cached = null;
}

/** Map a Gemini transport/quota failure to a safe, curated message. */
function geminiServiceError(status: number, detail: string): AIServiceError {
  if (status === 429) {
    return new AIServiceError("The fallback AI service (Gemini) has reached a usage limit. Rotate the Gemini API key under Settings → AI Providers, or try again later.");
  }
  if (status === 401 || status === 403) {
    return new AIServiceError("The fallback AI key (Gemini) was rejected. Update it under Settings → AI Providers.");
  }
  if (status === 400 || status === 404) {
    return new AIServiceError("The fallback AI service could not accept this request. Check the Gemini model name under Settings → AI Providers.");
  }
  console.error("Gemini request failed", status, detail);
  return new AIServiceError("The fallback AI service is temporarily unavailable. Please try again later.");
}

interface GeminiPart { text?: string }
interface GeminiResponse {
  candidates?: { content?: { parts?: GeminiPart[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
}

async function generate(system: string, userPrompt: string, json: boolean): Promise<string> {
  const { apiKey, model } = await resolveConfig();

  let res: Response;
  try {
    res = await fetch(`${ENDPOINT}/${model}:generateContent?key=${apiKey}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: userPrompt }] }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: json ? 4096 : 1024,
          ...(json ? { responseMimeType: "application/json" } : {}),
        },
      }),
    });
  } catch (err) {
    console.error("Gemini network error", err);
    throw new AIServiceError("The fallback AI service could not be reached. Please try again later.");
  }

  if (!res.ok) {
    throw geminiServiceError(res.status, await res.text().catch(() => ""));
  }

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
