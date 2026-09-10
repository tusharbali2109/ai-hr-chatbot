import Anthropic from "@anthropic-ai/sdk";

/** Only these curated messages are safe to return from server actions. */
export class AIServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AIServiceError";
  }
}

export function aiServiceError(error: unknown): AIServiceError {
  if (error instanceof AIServiceError) return error;
  if (error instanceof Anthropic.APIError) {
    if (error.status === 402 || (error.status === 400 && /credit balance|purchase credits|billing|spend limit/i.test(error.message))) {
      return new AIServiceError("AI is unavailable because the Anthropic account has insufficient credits or has reached its spending limit. Ask an administrator to update Plans & Billing, then retry.");
    }
    if (error.status === 401 || error.status === 403) {
      return new AIServiceError("AI access is not configured correctly. Ask an administrator to check the Anthropic API key and permissions, then retry.");
    }
    if (error.status === 429) {
      return new AIServiceError("The AI service has reached a usage limit. Please try again later or ask an administrator to check the account limits.");
    }
    if (error.status === 400 || error.status === 404) {
      return new AIServiceError("The AI service could not accept this request. Ask an administrator to check the model configuration.");
    }
  }
  return new AIServiceError("The AI service is temporarily unavailable. Please try again later.");
}
