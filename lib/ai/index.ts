import { anthropicProvider } from "@/lib/ai/anthropic-provider";
import type { AIProvider } from "@/lib/ai/provider";

export function getAIProvider(): AIProvider {
  return anthropicProvider;
}

export type { AIProvider, StructuredInputOverrides } from "@/lib/ai/provider";
export * from "@/lib/ai/schemas";
