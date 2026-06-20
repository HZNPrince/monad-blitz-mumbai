import { createHash, randomUUID } from "node:crypto";

import {
  activityEventSchema,
  assertCreativeTransition,
  generatedCreativeSchema,
  generationJobSchema,
  type ActivityEvent,
  type GeneratedCreative,
} from "@/server/domain/generation";
import {
  productDnaRecordSchema,
  type ProductDnaRecord,
} from "@/server/domain/product-dna";
import {
  createImageGenerationProvider,
  type ImageGenerationProvider,
} from "@/server/providers/image-generation";
import {
  generationStore,
  type GenerationStore,
} from "@/server/repositories/generation-store";
import {
  generatePremiumPrompt,
  generateAlternatePrompt,
} from "@/server/prompts/image-generation";

function now() {
  return new Date().toISOString();
}

function numericSeed(value: string) {
  return Number.parseInt(
    createHash("sha256").update(value).digest("hex").slice(0, 8),
    16,
  );
}

export function computeCreativeContentHash(
  input: Pick<GeneratedCreative, "imageDataUrl" | "layers" | "xCopy">,
) {
  return createHash("sha256")
    .update(JSON.stringify({
      imageDataUrl: input.imageDataUrl,
      layers: input.layers,
      xCopy: input.xCopy,
    }))
    .digest("hex");
}

function event(
  ownerId: string,
  entityId: string,
  type: ActivityEvent["type"],
  detail: string,
) {
  return activityEventSchema.parse({
    id: `evt_${randomUUID()}`,
    ownerId,
    entityId,
    type,
    detail,
    createdAt: now(),
  });
}

function angleInputs(dna: ProductDnaRecord, count: number) {
  type AngleInput = { id: string; title: string; description: string; evidence: string };
  const fallback: AngleInput[] = [];
  if (dna.benefits[0]) fallback.push(
    {
      id: "outcome",
      title: dna.benefits[0].value,
      description: `Lead with the verified customer outcome for ${dna.identity.name}.`,
      evidence: dna.benefits[0].value,
    },
  );
  if (dna.features[0]) fallback.push({
      id: "mechanism",
      title: dna.features[0].value,
      description: `Make this ${dna.identity.name} capability tangible.`,
      evidence: dna.features[0].value,
    });
  if (dna.audiences[0]) fallback.push({
      id: "audience",
      title: `Built for ${dna.audiences[0].value}`,
      description: `Use the audience language found on ${dna.identity.domain}.`,
      evidence: dna.audiences[0].value,
    });
  if (dna.products[0]?.description) fallback.push({
      id: "product",
      title: dna.products[0].name,
      description: dna.products[0].description,
      evidence: dna.products[0].description,
    });
  if (dna.identity.description) fallback.push({
      id: "positioning",
      title: dna.identity.name,
      description: dna.identity.description,
      evidence: dna.identity.description,
    });
  if (!fallback.length) {
    throw new Error("The site did not provide enough verified evidence to create campaigns.");
  }
  const source = dna.campaignAngles.length ? dna.campaignAngles : fallback;
  return Array.from({ length: count }, (_, index) => source[index % source.length]);
}

export class GenerationService {
  constructor(
    private readonly provider: ImageGenerationProvider =
      createImageGenerationProvider(),
    private readonly store: GenerationStore = generationStore,
  ) {}

  async createJob(input: {
    ownerId: string;
    productDna: ProductDnaRecord;
    count?: number;
  }) {
    const dna = productDnaRecordSchema.parse(input.productDna);
    const count = Math.max(3, Math.min(6, input.count ?? 4));
    const createdAt = now();
    const jobId = `job_${randomUUID()}`;
    const angles = angleInputs(dna, count);
    const sourceAssets = dna.visualAssets.slice(0, 4).map((asset) => asset.url);

    const prompts = angles.map((angle, idx) =>
      idx % 2 === 0
        ? generatePremiumPrompt({
            brandName: dna.identity.name,
            angle: angle.title,
            evidence: angle.evidence,
            colors: dna.identity.colors,
            domain: dna.identity.domain,
          })
        : generateAlternatePrompt({
            brandName: dna.identity.name,
            angle: angle.title,
            evidence: angle.evidence,
            colors: dna.identity.colors,
            domain: dna.identity.domain,
          }, idx),
    );
    let job = generationJobSchema.parse({
      id: jobId,
      ownerId: input.ownerId,
      productDnaId: dna.id,
      productDnaRevision: dna.revision,
      status: "QUEUED",
      requestedCount: count,
      provider: this.provider.name,
      providerMode: this.provider.mode,
      model: this.provider.model,
      prompts,
      sourceAssets,
      creativeIds: [],
      createdAt,
    });
    this.store.saveJob(job);
    this.store.addActivity(
      event(input.ownerId, jobId, "JOB_CREATED", `Queued ${count} campaign candidates.`),
    );

    job = generationJobSchema.parse({
      ...job,
      status: "RUNNING",
      startedAt: now(),
    });
    this.store.saveJob(job);
    const failures: string[] = [];

    for (let index = 0; index < angles.length; index += 1) {
      const angle = angles[index];
      const seed = numericSeed(`${dna.id}:${dna.revision}:${angle.id}:${index}`);
      try {
        const headline = angle.title.slice(0, 120);
        const subhead = angle.description.slice(0, 220);
        const cta = dna.callsToAction[0]?.value.slice(0, 48) || "See how it works";
        const output = await this.provider.generate({
          prompt: prompts[index],
          seed,
          width: 1200,
          height: 675,
          sourceAssets,
          headline,
          subhead,
          cta,
          colors: [
            dna.identity.colors[0] ?? "#C7E85B",
            dna.identity.colors[1] ?? "#10110D",
          ],
        });
        const layers: GeneratedCreative["layers"] = {
          headline,
          subhead,
          cta,
          productImageUrl: sourceAssets[0],
          palette: [
            dna.identity.colors[0] ?? "#C7E85B",
            dna.identity.colors[1] ?? "#10110D",
            "#F3F5EC",
          ],
          layout: ["launch", "signal", "split", "proof"][index % 4] as GeneratedCreative["layers"]["layout"],
        };
        const xCopy = `${headline}\n\n${angle.evidence}\n\n${cta}`;
        const creativeInput = {
          id: `creative_${randomUUID()}`,
          jobId,
          ownerId: input.ownerId,
          angleId: angle.id,
          angleTitle: angle.title,
          generationPrompt: prompts[index],
          provider: output.provider,
          providerMode: output.providerMode,
          model: output.model,
          seed: output.seed,
          options: output.options,
          inputAssets: sourceAssets,
          imageDataUrl: output.imageDataUrl,
          mediaType: output.mediaType,
          width: output.width,
          height: output.height,
          layers,
          xCopy,
          destinationUrl: dna.sourcePages[0],
          status: "GENERATED",
          createdAt: now(),
          updatedAt: now(),
        };
        const creative = generatedCreativeSchema.parse({
          ...creativeInput,
          contentHash: computeCreativeContentHash({ imageDataUrl: output.imageDataUrl, layers, xCopy }),
        });
        this.store.saveCreative(creative);
        job.creativeIds.push(creative.id);
        this.store.addActivity(
          event(input.ownerId, creative.id, "CREATIVE_GENERATED", angle.title),
        );
      } catch (error) {
        failures.push(error instanceof Error ? error.message : "Generation failed.");
      }
    }

    job = generationJobSchema.parse({
      ...job,
      status: job.creativeIds.length === count
        ? "SUCCEEDED"
        : job.creativeIds.length
          ? "PARTIALLY_SUCCEEDED"
          : "FAILED",
      error: failures.length ? failures.join(" ") : undefined,
      completedAt: now(),
    });
    this.store.saveJob(job);
    this.store.addActivity(
      event(
        input.ownerId,
        jobId,
        "JOB_COMPLETED",
        `${job.creativeIds.length}/${count} candidates generated.`,
      ),
    );
    return this.getJob(jobId, input.ownerId);
  }

  getJob(id: string, ownerId: string) {
    const job = this.store.getJob(id, ownerId);
    if (!job) throw new Error("Generation job not found.");
    return {
      job,
      creatives: this.store.getCreatives(job.creativeIds, ownerId),
    };
  }

  approve(id: string, ownerId: string) {
    return this.transition(id, ownerId, "APPROVED", "CREATIVE_APPROVED");
  }

  reject(id: string, ownerId: string, reason?: string) {
    return this.transition(
      id,
      ownerId,
      "REJECTED",
      "CREATIVE_REJECTED",
      { rejectionReason: reason },
    );
  }

  saveDraft(
    id: string,
    ownerId: string,
    patch: Pick<GeneratedCreative, "xCopy" | "layers">,
  ) {
    const creative = this.requireCreative(id, ownerId);
    assertCreativeTransition(creative.status, "DRAFT");
    const updated = generatedCreativeSchema.parse({
      ...creative,
      ...patch,
      contentHash: computeCreativeContentHash({ ...creative, ...patch }),
      status: "DRAFT",
      updatedAt: now(),
    });
    this.store.saveCreative(updated);
    this.store.addActivity(
      event(ownerId, id, "DRAFT_SAVED", updated.angleTitle),
    );
    return updated;
  }

  activity(ownerId: string) {
    return this.store.getActivity(ownerId);
  }

  getCreative(id: string, ownerId: string) {
    return this.requireCreative(id, ownerId);
  }

  recordAttributionClick(id: string, ownerId: string) {
    const creative = this.requireCreative(id, ownerId);
    this.store.addActivity(
      event(ownerId, id, "ATTRIBUTION_CLICKED", creative.angleTitle),
    );
    return creative;
  }

  beginPublishing(id: string, ownerId: string) {
    const creative = this.requireCreative(id, ownerId);
    assertCreativeTransition(creative.status, "PUBLISHING");
    const updated = generatedCreativeSchema.parse({
      ...creative,
      status: "PUBLISHING",
      updatedAt: now(),
    });
    this.store.saveCreative(updated);
    return updated;
  }

  completePublishing(
    id: string,
    ownerId: string,
    publication: GeneratedCreative["publication"],
  ) {
    const creative = this.requireCreative(id, ownerId);
    assertCreativeTransition(creative.status, "PUBLISHED");
    const updated = generatedCreativeSchema.parse({
      ...creative,
      status: "PUBLISHED",
      publication,
      updatedAt: now(),
    });
    this.store.saveCreative(updated);
    this.store.addActivity(
      event(ownerId, id, "CREATIVE_PUBLISHED", updated.angleTitle),
    );
    return updated;
  }

  failPublishing(id: string, ownerId: string) {
    const creative = this.requireCreative(id, ownerId);
    if (creative.status !== "PUBLISHING") return creative;
    const updated = generatedCreativeSchema.parse({
      ...creative,
      status: "DRAFT",
      updatedAt: now(),
    });
    this.store.saveCreative(updated);
    return updated;
  }

  private requireCreative(id: string, ownerId: string) {
    const creative = this.store.getCreative(id, ownerId);
    if (!creative) throw new Error("Creative not found.");
    return creative;
  }

  private transition(
    id: string,
    ownerId: string,
    status: "APPROVED" | "REJECTED",
    type: "CREATIVE_APPROVED" | "CREATIVE_REJECTED",
    patch: Partial<GeneratedCreative> = {},
  ) {
    const creative = this.requireCreative(id, ownerId);
    assertCreativeTransition(creative.status, status);
    const updated = generatedCreativeSchema.parse({
      ...creative,
      ...patch,
      status,
      updatedAt: now(),
    });
    this.store.saveCreative(updated);
    this.store.addActivity(event(ownerId, id, type, updated.angleTitle));
    return updated;
  }
}

export const generationService = new GenerationService();
