import { NextResponse } from "next/server";

import { verifyAttributionToken } from "@/server/attribution/tracked-links";
import { generationService } from "@/server/services/generation-service";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await context.params;
    const payload = verifyAttributionToken(token);
    const creative = generationService.getCreative(payload.creativeId, payload.ownerId);
    if (creative.contentHash !== payload.contentHash) {
      throw new Error("Attributed creative no longer matches the approved artifact.");
    }
    generationService.recordAttributionClick(payload.creativeId, payload.ownerId);
    const response = NextResponse.redirect(payload.destinationUrl, 302);
    response.headers.set("cache-control", "no-store");
    response.headers.set("referrer-policy", "no-referrer");
    return response;
  } catch {
    return NextResponse.json({ ok: false, error: "This attribution link is invalid or expired." }, { status: 410 });
  }
}
