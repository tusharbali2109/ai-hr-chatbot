const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured — Google Calendar OAuth is unavailable.`);
  return value;
}

function redirectUri(): string {
  const base = process.env.GOOGLE_OAUTH_REDIRECT_BASE_URL;
  if (!base) throw new Error("GOOGLE_OAUTH_REDIRECT_BASE_URL is not configured.");
  return `${base.replace(/\/$/, "")}/api/oauth/google-calendar/callback`;
}

/** access_type=offline + prompt=consent guarantees a refresh_token is
 * issued (Google only returns one on the first consent, or when forced). */
export function buildAuthUrl(state: string): string {
  const clientId = requireEnv("GOOGLE_CLIENT_ID");
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: CALENDAR_SCOPE,
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

export interface TokenResponse {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string;
  scope: string;
}

export async function exchangeCodeForTokens(code: string): Promise<TokenResponse> {
  const clientId = requireEnv("GOOGLE_CLIENT_ID");
  const clientSecret = requireEnv("GOOGLE_CLIENT_SECRET");

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri(),
      grant_type: "authorization_code",
    }),
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.error_description ?? body.error ?? `Google token exchange failed (${res.status}).`);
  }

  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token ?? null,
    expiresAt: new Date(Date.now() + body.expires_in * 1000).toISOString(),
    scope: body.scope ?? CALENDAR_SCOPE,
  };
}

export async function refreshAccessToken(refreshToken: string): Promise<Omit<TokenResponse, "refreshToken">> {
  const clientId = requireEnv("GOOGLE_CLIENT_ID");
  const clientSecret = requireEnv("GOOGLE_CLIENT_SECRET");

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
    }),
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.error_description ?? body.error ?? `Google token refresh failed (${res.status}).`);
  }

  return {
    accessToken: body.access_token,
    expiresAt: new Date(Date.now() + body.expires_in * 1000).toISOString(),
    scope: body.scope ?? CALENDAR_SCOPE,
  };
}
