import { NextResponse } from "next/server";

import { X_TOKEN_COOKIE, xConfigured } from "@/server/connectors/x-oauth";

export async function GET(request: Request) {
  const connected = Boolean(request.headers.get("cookie")?.includes(`${X_TOKEN_COOKIE}=`));
  return NextResponse.json({ ok: true, configured: xConfigured(), connected });
}
