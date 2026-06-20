export function ownerIdFromRequest(request: Request) {
  const ownerId = request.headers.get("x-traction-owner")?.trim();
  return ownerId && ownerId.length <= 120 ? ownerId : "local-user";
}
