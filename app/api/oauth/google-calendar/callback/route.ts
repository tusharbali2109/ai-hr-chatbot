import { NextResponse } from "next/server";
import { consumeOAuthState, upsertCalendarConnectionTokens, markCalendarConnectionError } from "@/lib/services/scheduling";
import { exchangeCodeForTokens } from "@/lib/oauth/google-calendar";

/**
 * OAuth callback for a single interviewer's Google Calendar connection
 * (spec §7/§8 — per-interviewer scoping, see plan Context). Validates and
 * consumes the signed oauth_states row (CSRF guard, mirrors the webhook
 * signature-verification discipline used elsewhere) before exchanging the
 * code — a request with a missing/expired/already-used state is rejected
 * outright, never trusted.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const oauthError = searchParams.get("error");

  const redirectBase = `${origin}/settings`;

  if (oauthError) {
    return NextResponse.redirect(`${redirectBase}?calendar_error=${encodeURIComponent(oauthError)}`);
  }
  if (!code || !state) {
    return NextResponse.redirect(`${redirectBase}?calendar_error=missing_code_or_state`);
  }

  const stateRow = await consumeOAuthState(state);
  if (!stateRow) {
    return NextResponse.redirect(`${redirectBase}?calendar_error=invalid_or_expired_state`);
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    await upsertCalendarConnectionTokens({
      interviewerId: stateRow.interviewer_id,
      companyId: stateRow.company_id,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      tokenExpiresAt: tokens.expiresAt,
      scope: tokens.scope,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Google Calendar connection failed.";
    await markCalendarConnectionError(stateRow.interviewer_id, message);
    return NextResponse.redirect(`${redirectBase}?calendar_error=${encodeURIComponent(message)}`);
  }

  return NextResponse.redirect(`${redirectBase}?calendar_connected=1`);
}
