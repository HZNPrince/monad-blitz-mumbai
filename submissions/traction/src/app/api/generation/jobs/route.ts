import { NextResponse } from "next/server";
import { z } from "zod";

import { productDnaRecordSchema } from "@/server/domain/product-dna";
import { ownerIdFromRequest } from "@/server/http/owner";
import { generationService } from "@/server/services/generation-service";

export const runtime = "nodejs";

const requestSchema = z.object({
  productDna: productDnaRecordSchema,
  count: z.number().int().min(3).max(6).optional(),
});

export async function POST(request: Request) {
  try {
    const body = requestSchema.parse(await request.json());
    const result = await generationService.createJob({
      ownerId: ownerIdFromRequest(request),
      productDna: body.productDna,
      count: body.count,
    });
    return NextResponse.json({ ok: true, ...result }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Generation failed.";
    return NextResponse.json({ ok: false, error: message }, { status: 422 });
  }
}
