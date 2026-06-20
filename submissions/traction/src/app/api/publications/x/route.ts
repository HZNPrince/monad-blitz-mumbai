import { NextResponse } from "next/server";

import { ownerIdFromRequest } from "@/server/http/owner";
import { createAttributionUrl } from "@/server/attribution/tracked-links";
import { decryptCookie, encryptCookie, refreshTokens, type XTokens, X_TOKEN_COOKIE, xConfigured } from "@/server/connectors/x-oauth";
import { publishToX, xPublishInputSchema } from "@/server/connectors/x-publisher";
import { generationService } from "@/server/services/generation-service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const ownerId = ownerIdFromRequest(request);
  let creativeId: string | undefined;
  try {
    if (!xConfigured()) throw new Error("X OAuth is not configured.");
    const cookie = request.headers.get("cookie")?.match(new RegExp(`${X_TOKEN_COOKIE}=([^;]+)`))?.[1];
    if (!cookie) return NextResponse.json({ ok: false, error: "Connect X before publishing." }, { status: 401 });
    const input = xPublishInputSchema.parse(await request.json());
    creativeId = input.creativeId;
    const publishingCreative = generationService.beginPublishing(input.creativeId, ownerId);
    const currentTokens = decryptCookie<XTokens>(decodeURIComponent(cookie));
    const tokens = await refreshTokens(currentTokens);
    if (!tokens.scope.split(" ").includes("media.write")) {
      throw new Error("Reconnect X with X_MEDIA_UPLOAD_ENABLED=true to publish campaign images.");
    }
    const trackedUrl = createAttributionUrl({
      creativeId: publishingCreative.id,
      ownerId,
      contentHash: publishingCreative.contentHash,
      destinationUrl: publishingCreative.destinationUrl,
    });
    const post = await publishToX({
      text: `${publishingCreative.xCopy.trim()}\n\n${trackedUrl}`,
      imageDataUrl: publishingCreative.imageDataUrl,
    }, tokens.accessToken);
    const publishedAt = new Date().toISOString();
    const creative = generationService.completePublishing(input.creativeId, ownerId, {
      platform: "x",
      remotePostId: post.id,
      url: `https://x.com/i/web/status/${post.id}`,
      trackedUrl,
      publishedAt,
    });
    const response = NextResponse.json({ ok: true, creative, post });
    if (tokens.accessToken !== currentTokens.accessToken) {
      response.cookies.set(X_TOKEN_COOKIE, encryptCookie(tokens), {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: 60 * 60 * 24 * 30,
        path: "/",
      });
    }
    return response;
  } catch (error) {
    if (creativeId) generationService.failPublishing(creativeId, ownerId);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "X publishing failed." },
      { status: 422 },
    );
  }
}
