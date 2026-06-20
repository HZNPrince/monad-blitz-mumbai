import { NextResponse } from "next/server";
import { z } from "zod";

import { ownerIdFromRequest } from "@/server/http/owner";
import { generationService } from "@/server/services/generation-service";

const requestSchema = z.object({
  reason: z.string().max(500).optional(),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const body = requestSchema.parse(await request.json());
    const creative = generationService.reject(
      id,
      ownerIdFromRequest(request),
      body.reason,
    );
    return NextResponse.json({ ok: true, creative });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Rejection failed.";
    return NextResponse.json({ ok: false, error: message }, { status: 409 });
  }
}
