import { createAIProvider } from "@/lib/ai/create-provider";
import { geminiEngine } from "@/lib/ai/gemini-engine";

/** Fallback provider — Google Gemini. Only reached when a call fails
 * against Anthropic (see fallback-provider.ts). The API key is resolved
 * per-call from the database / GEMINI_API_KEY env var inside the engine. */
export const geminiProvider = createAIProvider(geminiEngine);
