import { describe, it, expect } from "vitest";
import { computeTwilioSignature, verifyTwilioSignature } from "@/lib/interview/twilio-signature";

/**
 * These tests verify the algorithm's structural correctness (determinism,
 * sensitivity to every input, key-order independence) against Twilio's
 * documented scheme, rather than asserting a specific "known" signature
 * string — an external test vector can't be independently confirmed inside
 * this environment, and asserting an unverified magic constant would be
 * worse than testing the properties the spec actually guarantees.
 */

const URL = "https://example.com/api/webhooks/twilio/voice";
const AUTH_TOKEN = "test-auth-token";
const PARAMS = { CallSid: "CA123", From: "+919876543210", To: "+14155551212" };

describe("computeTwilioSignature", () => {
  it("is deterministic for the same input", () => {
    expect(computeTwilioSignature(URL, PARAMS, AUTH_TOKEN)).toBe(computeTwilioSignature(URL, PARAMS, AUTH_TOKEN));
  });

  it("is independent of the params object's key insertion order", () => {
    const reordered = { To: PARAMS.To, CallSid: PARAMS.CallSid, From: PARAMS.From };
    expect(computeTwilioSignature(URL, PARAMS, AUTH_TOKEN)).toBe(computeTwilioSignature(URL, reordered, AUTH_TOKEN));
  });

  it("changes when any parameter value changes", () => {
    const changed = { ...PARAMS, CallSid: "CA999" };
    expect(computeTwilioSignature(URL, PARAMS, AUTH_TOKEN)).not.toBe(computeTwilioSignature(URL, changed, AUTH_TOKEN));
  });

  it("changes when the URL changes", () => {
    expect(computeTwilioSignature(URL, PARAMS, AUTH_TOKEN)).not.toBe(computeTwilioSignature(URL + "?extra=1", PARAMS, AUTH_TOKEN));
  });

  it("changes when the auth token changes", () => {
    expect(computeTwilioSignature(URL, PARAMS, AUTH_TOKEN)).not.toBe(computeTwilioSignature(URL, PARAMS, "different-token"));
  });

  it("produces a base64 string", () => {
    expect(computeTwilioSignature(URL, PARAMS, AUTH_TOKEN)).toMatch(/^[A-Za-z0-9+/]+=*$/);
  });
});

describe("verifyTwilioSignature", () => {
  it("accepts a signature computed with matching inputs", () => {
    const signature = computeTwilioSignature(URL, PARAMS, AUTH_TOKEN);
    expect(verifyTwilioSignature(URL, PARAMS, signature, AUTH_TOKEN)).toBe(true);
  });

  it("rejects a tampered signature", () => {
    const signature = computeTwilioSignature(URL, PARAMS, AUTH_TOKEN);
    const tampered = signature.slice(0, -1) + (signature.at(-1) === "A" ? "B" : "A");
    expect(verifyTwilioSignature(URL, PARAMS, tampered, AUTH_TOKEN)).toBe(false);
  });

  it("rejects when params were tampered with after signing", () => {
    const signature = computeTwilioSignature(URL, PARAMS, AUTH_TOKEN);
    const tamperedParams = { ...PARAMS, CallSid: "CA999" };
    expect(verifyTwilioSignature(URL, tamperedParams, signature, AUTH_TOKEN)).toBe(false);
  });

  it("rejects a missing signature header", () => {
    expect(verifyTwilioSignature(URL, PARAMS, null, AUTH_TOKEN)).toBe(false);
    expect(verifyTwilioSignature(URL, PARAMS, undefined, AUTH_TOKEN)).toBe(false);
  });

  it("rejects a signature of the wrong length without throwing", () => {
    expect(verifyTwilioSignature(URL, PARAMS, "short", AUTH_TOKEN)).toBe(false);
  });
});
