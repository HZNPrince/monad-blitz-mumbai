import { NextResponse } from "next/server";

import { analyzeWebsite } from "@/lib/ingestion";
import type { AnalysisResponse } from "@/lib/product-dna";
import { canonicalizeProductDna } from "@/server/domain/product-dna";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { url?: unknown };
    if (typeof body.url !== "string" || body.url.length > 2_048) {
      return NextResponse.json<AnalysisResponse>(
        { ok: false, error: "Enter a valid website URL." },
        { status: 400 },
      );
    }
    const dna = await analyzeWebsite(body.url);
    const record = canonicalizeProductDna(
      dna,
      request.headers.get("x-traction-owner") || "local-user",
    );
    return NextResponse.json<AnalysisResponse>({ ok: true, dna, record });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The website could not be analyzed.";
    const safeMessage = /fetch failed|abort|timed out/i.test(message)
      ? "The website did not respond in time. Check the URL and try again."
      : message;
    return NextResponse.json<AnalysisResponse>(
      { ok: false, error: safeMessage },
      { status: 422 },
    );
  }
}
