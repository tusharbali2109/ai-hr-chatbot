/**
 * The transport contract every AI backend must satisfy. Everything above
 * this line (prompt construction, schema validation, the AIProvider shape)
 * is backend-agnostic and lives in create-provider.ts; everything below it
 * (which model, which HTTP API, how JSON mode is requested, how provider
 * errors map to AIServiceError) is a per-engine concern.
 *
 * Two engines implement this today: anthropic-engine.ts (primary) and
 * gemini-engine.ts (fallback for when the Anthropic account is out of
 * credits or rate-limited). fallback-provider.ts chains them.
 */
export interface AIEngine {
  /** Human-readable name for logs (e.g. "Anthropic", "Gemini"). */
  readonly label: string;

  /**
   * Ask the model for a single JSON object, JSON.parse it, then hand the
   * raw value to `parse` (a zod schema parse) which is the real validation
   * gate. Must retry genuinely malformed model output up to `retries`
   * times, but must NEVER retry a billing / auth / rate-limit / transport
   * failure as if it were malformed output — those throw AIServiceError
   * immediately so the caller (or the fallback provider) can react.
   */
  callStructured<T>(
    system: string,
    userPrompt: string,
    jsonSchema: object,
    parse: (raw: unknown) => T,
    retries?: number
  ): Promise<T>;

  /**
   * Freeform prose answer for a human to read directly (the "Explain this
   * candidate" chat) — no JSON, no schema. Provider errors map to
   * AIServiceError the same way.
   */
  callText(system: string, userPrompt: string): Promise<string>;
}
