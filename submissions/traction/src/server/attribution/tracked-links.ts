import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

const attributionPayloadSchema = z.object({
  version: z.literal(1),
  creativeId: z.string().min(1),
  ownerId: z.string().min(1).max(120),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  destinationUrl: z.string().url(),
  issuedAt: z.number().int().positive(),
  expiresAt: z.number().int().positive(),
});

export type AttributionPayload = z.infer<typeof attributionPayloadSchema>;

function secret(explicit?: string) {
  const value = explicit ?? process.env.TRACKING_SIGNING_SECRET?.trim();
  if (value) return value;
  if (process.env.NODE_ENV !== "production") return "traction-local-development-only";
  throw new Error("TRACKING_SIGNING_SECRET is required in production.");
}

function signature(encodedPayload: string, signingSecret?: string) {
  return createHmac("sha256", secret(signingSecret))
    .update(encodedPayload)
    .digest("base64url");
}

export function createAttributionToken(
  input: Omit<AttributionPayload, "version" | "issuedAt" | "expiresAt">,
  options: { now?: number; ttlSeconds?: number; signingSecret?: string } = {},
) {
  const issuedAt = options.now ?? Math.floor(Date.now() / 1_000);
  const payload = attributionPayloadSchema.parse({
    ...input,
    version: 1,
    issuedAt,
    expiresAt: issuedAt + (options.ttlSeconds ?? 60 * 60 * 24 * 30),
  });
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${signature(encoded, options.signingSecret)}`;
}

export function verifyAttributionToken(
  token: string,
  options: { now?: number; signingSecret?: string } = {},
) {
  if (token.length > 4_096) throw new Error("Attribution token is too large.");
  const [encoded, supplied, extra] = token.split(".");
  if (!encoded || !supplied || extra) throw new Error("Invalid attribution token.");
  const expected = signature(encoded, options.signingSecret);
  const suppliedBytes = Buffer.from(supplied);
  const expectedBytes = Buffer.from(expected);
  if (
    suppliedBytes.length !== expectedBytes.length
    || !timingSafeEqual(suppliedBytes, expectedBytes)
  ) {
    throw new Error("Invalid attribution signature.");
  }
  const payload = attributionPayloadSchema.parse(
    JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")),
  );
  const now = options.now ?? Math.floor(Date.now() / 1_000);
  if (payload.expiresAt < now) throw new Error("Attribution link expired.");
  return payload;
}

export function createAttributionUrl(
  input: Omit<AttributionPayload, "version" | "issuedAt" | "expiresAt">,
  options: { baseUrl?: string; now?: number; ttlSeconds?: number; signingSecret?: string } = {},
) {
  const baseUrl = new URL(options.baseUrl ?? process.env.APP_BASE_URL ?? "http://127.0.0.1:3000");
  if (!["http:", "https:"].includes(baseUrl.protocol)) throw new Error("APP_BASE_URL must use http(s).");
  return new URL(`/r/${createAttributionToken(input, options)}`, baseUrl).href;
}
