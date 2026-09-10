import { anthropicProvider } from "@/lib/ai/anthropic-provider";
import { geminiProvider } from "@/lib/ai/gemini-provider";
import { createFallbackProvider } from "@/lib/ai/fallback-provider";
import type { AIProvider } from "@/lib/ai/provider";

/**
 * Anthropic is always first priority. Any call that fails against Anthropic
 * (out of credits, rate-limited, key missing, outage) is automatically
 * retried on Gemini instead of surfacing an error to the recruiter. Gemini
 * only needs a key configured — in the database (Settings → AI Providers,
 * rotatable live) or the GEMINI_API_KEY env var. If Gemini has no key or
 * also fails, the original Anthropic error is what surfaces.
 */
export function getAIProvider(): AIProvider {
  return createFallbackProvider(anthropicProvider, geminiProvider);
}

export type { AIProvider, StructuredInputOverrides } from "@/lib/ai/provider";
export * from "@/lib/ai/schemas";
