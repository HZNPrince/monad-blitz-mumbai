import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

export const X_FLOW_COOKIE = "traction_x_flow";
export const X_TOKEN_COOKIE = "traction_x_token";
export const X_OAUTH_SCOPES = ["tweet.read", "tweet.write", "users.read", "offline.access"] as const;

export function xOAuthScopes(env: Partial<NodeJS.ProcessEnv> = process.env) {
  return env.X_MEDIA_UPLOAD_ENABLED === "true"
    ? [...X_OAUTH_SCOPES, "media.write"]
    : [...X_OAUTH_SCOPES];
}

export type XTokens = {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  scope: string;
};

export function xConfigured() {
  return Boolean(
    process.env.X_CLIENT_ID &&
      process.env.X_CLIENT_SECRET &&
      process.env.X_REDIRECT_URI &&
      process.env.X_TOKEN_ENCRYPTION_KEY,
  );
}

function key() {
  const secret = process.env.X_TOKEN_ENCRYPTION_KEY;
  if (!secret) throw new Error("X_TOKEN_ENCRYPTION_KEY is not configured.");
  return createHash("sha256").update(secret).digest();
}

export function encryptCookie(value: unknown) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64url");
}

export function decryptCookie<T>(value: string): T {
  const buffer = Buffer.from(value, "base64url");
  if (buffer.length < 29) throw new Error("Invalid encrypted cookie.");
  const decipher = createDecipheriv("aes-256-gcm", key(), buffer.subarray(0, 12));
  decipher.setAuthTag(buffer.subarray(12, 28));
  const decrypted = Buffer.concat([decipher.update(buffer.subarray(28)), decipher.final()]);
  return JSON.parse(decrypted.toString("utf8")) as T;
}

export function createPkceFlow() {
  const state = randomBytes(24).toString("base64url");
  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { state, verifier, challenge };
}

function tokenHeaders() {
  const clientId = process.env.X_CLIENT_ID!;
  const clientSecret = process.env.X_CLIENT_SECRET!;
  return {
    "content-type": "application/x-www-form-urlencoded",
    authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
  };
}

async function parseTokenResponse(response: Response) {
  const payload = await response.json() as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
    error_description?: string;
  };
  if (!response.ok || !payload.access_token) {
    throw new Error(payload.error_description ?? "X token exchange failed.");
  }
  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
    expiresAt: Date.now() + (payload.expires_in ?? 7_200) * 1_000,
    scope: payload.scope ?? "",
  } satisfies XTokens;
}

export async function exchangeCode(code: string, verifier: string) {
  const body = new URLSearchParams({
    code,
    grant_type: "authorization_code",
    client_id: process.env.X_CLIENT_ID!,
    redirect_uri: process.env.X_REDIRECT_URI!,
    code_verifier: verifier,
  });
  return parseTokenResponse(await fetch("https://api.x.com/2/oauth2/token", {
    method: "POST",
    headers: tokenHeaders(),
    body,
    cache: "no-store",
  }));
}

export async function refreshTokens(tokens: XTokens) {
  if (tokens.expiresAt > Date.now() + 60_000) return tokens;
  if (!tokens.refreshToken) throw new Error("X authorization expired. Connect X again.");
  const body = new URLSearchParams({
    refresh_token: tokens.refreshToken,
    grant_type: "refresh_token",
    client_id: process.env.X_CLIENT_ID!,
  });
  const refreshed = await parseTokenResponse(await fetch("https://api.x.com/2/oauth2/token", {
    method: "POST",
    headers: tokenHeaders(),
    body,
    cache: "no-store",
  }));
  return { ...refreshed, refreshToken: refreshed.refreshToken ?? tokens.refreshToken };
}
