import { NextResponse } from "next/server";

import { decryptCookie, encryptCookie, exchangeCode, X_FLOW_COOKIE, X_TOKEN_COOKIE } from "@/server/connectors/x-oauth";

export const runtime = "nodejs";

function popup(message: string, ok: boolean) {
  const serializeForInlineScript = (value: unknown) => JSON.stringify(value).replace(/</g, "\\u003c");
  const origin = serializeForInlineScript(process.env.APP_BASE_URL ?? "http://127.0.0.1:3000");
  const payload = serializeForInlineScript({ type: ok ? "traction:x-connected" : "traction:x-error", message });
  const safeMessage = message.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[character] ?? character);
  return new NextResponse(`<!doctype html><meta charset="utf-8"><title>Traction · X</title><body style="background:#10110D;color:#F3F5EC;font-family:system-ui;padding:32px"><p>${safeMessage}</p><script>window.opener?.postMessage(${payload}, ${origin});window.close();</script></body>`, {
    status: ok ? 200 : 400,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const error = url.searchParams.get("error_description") ?? url.searchParams.get("error");
    if (error) throw new Error(error);
    if (!code || !state) throw new Error("X did not return a valid authorization code.");
    const cookie = request.headers.get("cookie")?.match(new RegExp(`${X_FLOW_COOKIE}=([^;]+)`))?.[1];
    if (!cookie) throw new Error("The X authorization session expired.");
    const flow = decryptCookie<{ state: string; verifier: string }>(decodeURIComponent(cookie));
    if (flow.state !== state) throw new Error("X authorization state did not match.");
    const tokens = await exchangeCode(code, flow.verifier);
    const response = popup("X connected. You can close this window.", true);
    response.cookies.delete(X_FLOW_COOKIE);
    response.cookies.set(X_TOKEN_COOKIE, encryptCookie(tokens), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24 * 30,
      path: "/",
    });
    return response;
  } catch (error) {
    return popup(error instanceof Error ? error.message : "X authorization failed.", false);
  }
}
