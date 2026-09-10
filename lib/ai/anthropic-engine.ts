import Anthropic from "@anthropic-ai/sdk";
import { AIServiceError, aiServiceError } from "@/lib/ai/errors";
import type { AIEngine } from "@/lib/ai/engine";

export const MODEL = "claude-opus-5";

function client() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new AIServiceError("AI is not configured. Ask an administrator to set the Anthropic API key for this deployment.");
  }
  return new Anthropic({ apiKey });
}

function firstTextBlock(message: Anthropic.Message): string {
  if (message.stop_reason === "refusal") {
    throw new Error("The AI declined to process this request. Please rephrase and try again.");
  }
  const block = message.content.find((b) => b.type === "text");
  if (!block || block.type !== "text") {
    throw new Error("AI response contained no text output.");
  }
  return block.text;
}

async function callStructured<T>(
  system: string,
  userPrompt: string,
  jsonSchema: object,
  parse: (raw: unknown) => T,
  retries = 1
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const message = await client().messages.create({
        model: MODEL,
        max_tokens: 4096,
        system,
        output_config: {
          effort: "medium",
          format: { type: "json_schema", schema: jsonSchema as Record<string, unknown> },
        },
        messages: [{ role: "user", content: userPrompt }],
      });

      const text = firstTextBlock(message);
      const raw = JSON.parse(text);
      return parse(raw);
    } catch (err) {
      // The SDK handles transient transport retries. Never retry billing,
      // authentication, or network errors as malformed model output.
      if (err instanceof Anthropic.APIError || err instanceof AIServiceError) {
        throw aiServiceError(err);
      }
      lastError = err;
    }
  }

  console.error("AI output validation failed", lastError);
  throw new AIServiceError("The AI returned an unreadable response. Please retry.");
}

async function callText(system: string, userPrompt: string): Promise<string> {
  try {
    const message = await client().messages.create({
      model: MODEL,
      max_tokens: 1024,
      system,
      output_config: { effort: "medium" },
      messages: [{ role: "user", content: userPrompt }],
    });
    return firstTextBlock(message).trim();
  } catch (error) {
    throw aiServiceError(error);
  }
}

export const anthropicEngine: AIEngine = { label: "Anthropic", callStructured, callText };
