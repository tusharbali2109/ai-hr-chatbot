/** The idempotency key backing external_events' unique(platform, external_event_id). */
export function buildEventKey(platform: string, externalEventId: string): string {
  return `${platform.toLowerCase()}:${externalEventId}`;
}

const MAX_ATTEMPTS = 5;
const BASE_DELAY_MS = 500;

/** Exponential backoff, bounded — never retries forever. Reused for both
 * webhook redelivery bookkeeping and sync-time rate-limit handling. */
export function computeBackoffDelayMs(attempt: number): number | null {
  if (attempt < 1 || attempt > MAX_ATTEMPTS) return null;
  return BASE_DELAY_MS * 2 ** (attempt - 1);
}

export function isRetryExhausted(attempt: number): boolean {
  return attempt >= MAX_ATTEMPTS;
}
