import { NextResponse } from "next/server";

import { createPkceFlow, encryptCookie, X_FLOW_COOKIE, xConfigured, xOAuthScopes } from "@/server/connectors/x-oauth";

export const runtime = "nodejs";

export async function GET() {
  if (!xConfigured()) {
    return NextResponse.json({ ok: false, error: "X OAuth is not configured." }, { status: 503 });
  }
  const flow = createPkceFlow();
  const url = new URL("https://x.com/i/oauth2/authorize");
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: process.env.X_CLIENT_ID!,
    redirect_uri: process.env.X_REDIRECT_URI!,
    scope: xOAuthScopes().join(" "),
    state: flow.state,
    code_challenge: flow.challenge,
    code_challenge_method: "S256",
  }).toString();
  const response = NextResponse.redirect(url);
  response.cookies.set(X_FLOW_COOKIE, encryptCookie({ state: flow.state, verifier: flow.verifier }), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 600,
    path: "/",
  });
  return response;
}
