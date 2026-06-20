import { after, NextResponse } from "next/server";
import { z } from "zod";

import { ownerIdFromRequest } from "@/server/http/owner";
import { analysisService } from "@/server/services/analysis-service";

export const runtime = "nodejs";

const requestSchema = z.object({ url: z.string().trim().min(3).max(2_048) });

export async function POST(request: Request) {
  try {
    const { url } = requestSchema.parse(await request.json());
    const job = analysisService.create(url, ownerIdFromRequest(request));
    after(() => analysisService.run(job.id));
    return NextResponse.json({ ok: true, job }, { status: 202 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Enter a valid public website URL.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
