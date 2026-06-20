import { NextResponse } from "next/server";

import { ownerIdFromRequest } from "@/server/http/owner";
import { generationService } from "@/server/services/generation-service";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const result = generationService.getJob(id, ownerIdFromRequest(request));
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Job not found.";
    return NextResponse.json({ ok: false, error: message }, { status: 404 });
  }
}
