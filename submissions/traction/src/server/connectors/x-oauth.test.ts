import { afterEach, describe, expect, it } from "vitest";

import { createPkceFlow, decryptCookie, encryptCookie, X_OAUTH_SCOPES, xConfigured, xOAuthScopes } from "./x-oauth";

afterEach(() => {
  delete process.env.X_CLIENT_ID;
  delete process.env.X_CLIENT_SECRET;
  delete process.env.X_REDIRECT_URI;
  delete process.env.X_TOKEN_ENCRYPTION_KEY;
});

describe("X OAuth security", () => {
  it("round-trips encrypted HttpOnly-cookie payloads", () => {
    process.env.X_TOKEN_ENCRYPTION_KEY = "test-only-secret";
    const encrypted = encryptCookie({ accessToken: "secret", expiresAt: 123 });
    expect(encrypted).not.toContain("secret");
    expect(decryptCookie(encrypted)).toEqual({ accessToken: "secret", expiresAt: 123 });
  });

  it("creates unique PKCE flows", () => {
    const first = createPkceFlow();
    const second = createPkceFlow();
    expect(first.state).not.toBe(second.state);
    expect(first.verifier).not.toBe(first.challenge);
  });

  it("requires the complete confidential-client configuration", () => {
    process.env.X_CLIENT_ID = "id";
    expect(xConfigured()).toBe(false);
    process.env.X_CLIENT_SECRET = "secret";
    process.env.X_REDIRECT_URI = "http://127.0.0.1:3000/api/connectors/x/callback";
    process.env.X_TOKEN_ENCRYPTION_KEY = "key";
    expect(xConfigured()).toBe(true);
  });

  it("requests only the user publishing and refresh scopes", () => {
    expect(X_OAUTH_SCOPES).toEqual(["tweet.read", "tweet.write", "users.read", "offline.access"]);
    expect(xOAuthScopes({})).toEqual(X_OAUTH_SCOPES);
  });

  it("requests media upload permission only when visual publishing is enabled", () => {
    expect(xOAuthScopes({ X_MEDIA_UPLOAD_ENABLED: "true" })).toContain("media.write");
  });
});
