import { NextResponse } from "next/server";

import { ownerIdFromRequest } from "@/server/http/owner";
import { generationService } from "@/server/services/generation-service";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const creative = generationService.approve(id, ownerIdFromRequest(request));
    return NextResponse.json({ ok: true, creative });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Approval failed.";
    return NextResponse.json({ ok: false, error: message }, { status: 409 });
  }
}
