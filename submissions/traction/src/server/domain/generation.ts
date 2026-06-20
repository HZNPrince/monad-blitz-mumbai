import { z } from "zod";

export const generationJobStatusSchema = z.enum([
  "QUEUED",
  "RUNNING",
  "SUCCEEDED",
  "PARTIALLY_SUCCEEDED",
  "FAILED",
  "CANCELLED",
]);

export const creativeStatusSchema = z.enum([
  "GENERATED",
  "APPROVED",
  "REJECTED",
  "DRAFT",
  "PUBLISHING",
  "PUBLISHED",
  "MEASURING",
  "SETTLED",
]);

export const creativeLayersSchema = z.object({
  headline: z.string().max(120),
  subhead: z.string().max(220),
  cta: z.string().max(48),
  productImageUrl: z.string().url().optional(),
  palette: z.array(z.string()).min(2).max(6),
  layout: z.enum(["signal", "split", "proof", "launch"]),
});

export const generatedCreativeSchema = z.object({
  id: z.string().min(1),
  jobId: z.string().min(1),
  ownerId: z.string().min(1),
  angleId: z.string().min(1),
  angleTitle: z.string().min(1),
  generationPrompt: z.string().min(1),
  provider: z.string().min(1),
  providerMode: z.enum(["live", "local"]),
  model: z.string().min(1),
  seed: z.number().int().nonnegative(),
  options: z.record(z.string(), z.unknown()),
  inputAssets: z.array(z.string().url()),
  imageDataUrl: z.string().startsWith("data:image/"),
  mediaType: z.string().startsWith("image/"),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  layers: creativeLayersSchema,
  xCopy: z.string().max(10_000),
  destinationUrl: z.string().url(),
  contentHash: z.string().min(1),
  status: creativeStatusSchema,
  publication: z.object({
    platform: z.literal("x"),
    remotePostId: z.string().min(1),
    url: z.string().url(),
    trackedUrl: z.string().url(),
    publishedAt: z.string().datetime(),
  }).optional(),
  rejectionReason: z.string().max(500).optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const generationJobSchema = z.object({
  id: z.string().min(1),
  ownerId: z.string().min(1),
  productDnaId: z.string().min(1),
  productDnaRevision: z.number().int().positive(),
  status: generationJobStatusSchema,
  requestedCount: z.number().int().min(3).max(6),
  provider: z.string().min(1),
  providerMode: z.enum(["live", "local"]),
  model: z.string().min(1),
  prompts: z.array(z.string()),
  sourceAssets: z.array(z.string().url()),
  creativeIds: z.array(z.string()),
  error: z.string().optional(),
  createdAt: z.string().datetime(),
  startedAt: z.string().datetime().optional(),
  completedAt: z.string().datetime().optional(),
});

export const activityEventSchema = z.object({
  id: z.string(),
  ownerId: z.string(),
  entityId: z.string(),
  type: z.enum([
    "JOB_CREATED",
    "JOB_COMPLETED",
    "CREATIVE_GENERATED",
    "CREATIVE_APPROVED",
    "CREATIVE_REJECTED",
    "DRAFT_SAVED",
    "CREATIVE_PUBLISHED",
    "ATTRIBUTION_CLICKED",
  ]),
  detail: z.string(),
  createdAt: z.string().datetime(),
});

export type GenerationJob = z.infer<typeof generationJobSchema>;
export type GeneratedCreative = z.infer<typeof generatedCreativeSchema>;
export type CreativeStatus = z.infer<typeof creativeStatusSchema>;
export type ActivityEvent = z.infer<typeof activityEventSchema>;

const creativeTransitions: Record<CreativeStatus, CreativeStatus[]> = {
  GENERATED: ["APPROVED", "REJECTED"],
  APPROVED: ["DRAFT", "PUBLISHING"],
  REJECTED: [],
  DRAFT: ["DRAFT", "PUBLISHING"],
  PUBLISHING: ["PUBLISHED", "DRAFT"],
  PUBLISHED: ["MEASURING"],
  MEASURING: ["SETTLED"],
  SETTLED: [],
};

export function assertCreativeTransition(
  from: CreativeStatus,
  to: CreativeStatus,
) {
  if (!creativeTransitions[from].includes(to)) {
    throw new Error(`Creative cannot transition from ${from} to ${to}.`);
  }
}
