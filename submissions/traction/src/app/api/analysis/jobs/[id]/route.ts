import { NextResponse } from "next/server";

import { ownerIdFromRequest } from "@/server/http/owner";
import { analysisService } from "@/server/services/analysis-service";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const job = analysisService.get(id, ownerIdFromRequest(request));
  if (!job) return NextResponse.json({ ok: false, error: "Analysis job not found." }, { status: 404 });
  return NextResponse.json({ ok: true, job });
}
