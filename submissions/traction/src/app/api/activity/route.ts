import { NextResponse } from "next/server";

import { ownerIdFromRequest } from "@/server/http/owner";
import { generationService } from "@/server/services/generation-service";

export async function GET(request: Request) {
  return NextResponse.json({
    ok: true,
    activity: generationService.activity(ownerIdFromRequest(request)),
  });
}
