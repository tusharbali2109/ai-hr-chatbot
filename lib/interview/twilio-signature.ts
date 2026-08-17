import { createHmac, timingSafeEqual } from "crypto";

/**
 * Twilio's documented request-validation algorithm: sort the POST
 * parameters by key, append each key+value (no separator) to the full
 * request URL, HMAC-SHA1 the result with the account's auth token, and
 * base64-encode the digest. See Twilio's "Validating Requests" docs — this
 * is not invented, it's their published, stable scheme.
 */
export function computeTwilioSignature(url: string, params: Record<string, string>, authToken: string): string {
  const sortedKeys = Object.keys(params).sort();
  let data = url;
  for (const key of sortedKeys) {
    data += key + params[key];
  }
  return createHmac("sha1", authToken).update(data, "utf-8").digest("base64");
}

/**
 * Constant-time comparison against the request's X-Twilio-Signature
 * header. Returns false (never throws) for a missing/malformed header so
 * the caller can uniformly reject with 401.
 */
export function verifyTwilioSignature(
  url: string,
  params: Record<string, string>,
  headerSignature: string | null | undefined,
  authToken: string
): boolean {
  if (!headerSignature) return false;

  const expected = computeTwilioSignature(url, params, authToken);
  const expectedBuf = Buffer.from(expected);
  const actualBuf = Buffer.from(headerSignature);

  if (expectedBuf.length !== actualBuf.length) return false;
  return timingSafeEqual(expectedBuf, actualBuf);
}
