import { createAIProvider } from "@/lib/ai/create-provider";
import { anthropicEngine, MODEL } from "@/lib/ai/anthropic-engine";

/** The Claude API model id used for every AI call and recorded on agent
 * runs / interview records as modelVersion. */
export { MODEL };

/** Primary provider — Anthropic Claude. Prompt construction and schema
 * validation live in create-provider.ts; the transport lives in
 * anthropic-engine.ts. */
export const anthropicProvider = createAIProvider(anthropicEngine);
