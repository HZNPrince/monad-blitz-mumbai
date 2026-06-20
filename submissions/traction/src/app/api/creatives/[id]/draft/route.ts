import { NextResponse } from "next/server";
import { z } from "zod";

import { creativeLayersSchema } from "@/server/domain/generation";
import { ownerIdFromRequest } from "@/server/http/owner";
import { generationService } from "@/server/services/generation-service";

const requestSchema = z.object({
  xCopy: z.string().max(10_000),
  layers: creativeLayersSchema,
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const body = requestSchema.parse(await request.json());
    const creative = generationService.saveDraft(
      id,
      ownerIdFromRequest(request),
      body,
    );
    return NextResponse.json({ ok: true, creative });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Draft save failed.";
    return NextResponse.json({ ok: false, error: message }, { status: 409 });
  }
}
