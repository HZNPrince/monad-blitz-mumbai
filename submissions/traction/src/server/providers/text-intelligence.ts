import { z } from "zod";

import type { EvidenceItem, ProductDna } from "@/lib/product-dna";

export type TextIntelligenceInput = {
  productDna: ProductDna;
  cleanedEvidence: string;
};

export interface TextIntelligenceProvider {
  readonly name: string;
  readonly mode: "live" | "local";
  readonly model: string;
  enhance(input: TextIntelligenceInput): Promise<ProductDna>;
}

const evidenceItemSchema = z.object({
  value: z.string().min(4).max(280),
  source: z.string().min(1).max(120),
});

const angleSchema = z.object({
  id: z.string().min(1).max(80),
  title: z.string().min(4).max(100),
  description: z.string().min(4).max(220),
  format: z.string().min(2).max(80),
  evidence: z.string().min(4).max(280),
});

const intelligenceSchema = z.object({
  description: z.string().max(400),
  features: z.array(evidenceItemSchema).max(8),
  benefits: z.array(evidenceItemSchema).max(8),
  audiences: z.array(evidenceItemSchema).max(6),
  painPoints: z.array(evidenceItemSchema).max(6),
  differentiators: z.array(evidenceItemSchema).max(6),
  callsToAction: z.array(evidenceItemSchema).max(8),
  opportunities: z.array(angleSchema).min(1).max(4),
});

type Intelligence = z.infer<typeof intelligenceSchema>;

function uniqueEvidence(items: EvidenceItem[], limit: number) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = item.value.toLowerCase().trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, limit);
}

function merge(base: ProductDna, intelligence: Intelligence): ProductDna {
  return {
    ...base,
    identity: {
      ...base.identity,
      description: intelligence.description || base.identity.description,
    },
    features: uniqueEvidence([...intelligence.features, ...base.features], 8),
    benefits: uniqueEvidence([...intelligence.benefits, ...base.benefits], 8),
    audiences: uniqueEvidence([...intelligence.audiences, ...base.audiences], 6),
    painPoints: uniqueEvidence([...intelligence.painPoints, ...base.painPoints], 6),
    differentiators: uniqueEvidence([...intelligence.differentiators, ...base.differentiators], 6),
    callsToAction: uniqueEvidence([...intelligence.callsToAction, ...base.callsToAction], 8),
    opportunities: intelligence.opportunities,
  };
}

export class DeterministicTextIntelligenceProvider implements TextIntelligenceProvider {
  readonly name = "local-evidence-parser";
  readonly mode = "local" as const;
  readonly model = "traction-evidence-rules-v2";

  async enhance(input: TextIntelligenceInput) {
    return input.productDna;
  }
}

const cloudflareEnvelopeSchema = z.object({
  success: z.boolean(),
  result: z.object({ response: z.unknown() }).optional(),
  errors: z.array(z.object({ message: z.string().optional() })).optional(),
});

const responseFormat = {
  type: "json_schema",
  json_schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      description: { type: "string" },
      features: { type: "array", items: { type: "object", properties: { value: { type: "string" }, source: { type: "string" } }, required: ["value", "source"] } },
      benefits: { type: "array", items: { type: "object", properties: { value: { type: "string" }, source: { type: "string" } }, required: ["value", "source"] } },
      audiences: { type: "array", items: { type: "object", properties: { value: { type: "string" }, source: { type: "string" } }, required: ["value", "source"] } },
      painPoints: { type: "array", items: { type: "object", properties: { value: { type: "string" }, source: { type: "string" } }, required: ["value", "source"] } },
      differentiators: { type: "array", items: { type: "object", properties: { value: { type: "string" }, source: { type: "string" } }, required: ["value", "source"] } },
      callsToAction: { type: "array", items: { type: "object", properties: { value: { type: "string" }, source: { type: "string" } }, required: ["value", "source"] } },
      opportunities: { type: "array", items: { type: "object", properties: { id: { type: "string" }, title: { type: "string" }, description: { type: "string" }, format: { type: "string" }, evidence: { type: "string" } }, required: ["id", "title", "description", "format", "evidence"] } },
    },
    required: ["description", "features", "benefits", "audiences", "painPoints", "differentiators", "callsToAction", "opportunities"],
  },
} as const;

export class CloudflareTextIntelligenceProvider implements TextIntelligenceProvider {
  readonly name = "cloudflare-workers-ai";
  readonly mode = "live" as const;

  constructor(
    private readonly accountId: string,
    private readonly apiToken: string,
    readonly model = "@cf/meta/llama-3.1-8b-instruct-fast",
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async enhance(input: TextIntelligenceInput) {
    const evidence = input.cleanedEvidence.slice(0, 28_000);
    let repairContext = "";
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await this.fetchImpl(
        `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/ai/run/${this.model}`,
        {
          method: "POST",
          headers: { authorization: `Bearer ${this.apiToken}`, "content-type": "application/json" },
          signal: AbortSignal.timeout(20_000),
          body: JSON.stringify({
            messages: [
              {
                role: "system",
                content: "Extract commercial Product DNA only from supplied website evidence. Unknown fields must be empty. Campaign angles must quote or closely paraphrase evidence; never invent pricing, audiences, proof, or founder stories.",
              },
              {
                role: "user",
                content: `Brand: ${input.productDna.identity.name}\nURL: ${input.productDna.sourcePages[0]}\n${repairContext}\nEVIDENCE:\n${evidence}`,
              },
            ],
            response_format: responseFormat,
            max_tokens: 1_800,
            temperature: 0.1,
          }),
        },
      );
      const envelope = cloudflareEnvelopeSchema.parse(await response.json());
      if (!response.ok || !envelope.success || envelope.result?.response === undefined) {
        throw new Error(envelope.errors?.[0]?.message ?? "Cloudflare text intelligence failed.");
      }
      try {
        const raw = envelope.result.response;
        const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
        return merge(input.productDna, intelligenceSchema.parse(parsed));
      } catch (error) {
        if (attempt === 1) throw new Error("Cloudflare returned Product DNA that did not match the required schema.", { cause: error });
        repairContext = "Your previous response failed schema validation. Return only corrected schema JSON with no markdown.";
      }
    }
    return input.productDna;
  }
}

export function createTextIntelligenceProvider(
  env: Record<string, string | undefined> = process.env,
): TextIntelligenceProvider {
  if (env.TEXT_INTELLIGENCE_PROVIDER === "local") return new DeterministicTextIntelligenceProvider();
  if (env.CF_ACCOUNT_ID && env.CLOUDFLARE_AI_API_TOKEN) {
    return new CloudflareTextIntelligenceProvider(
      env.CF_ACCOUNT_ID,
      env.CLOUDFLARE_AI_API_TOKEN,
      env.CF_TEXT_MODEL,
    );
  }
  if (env.TEXT_INTELLIGENCE_PROVIDER === "cloudflare") {
    throw new Error("Cloudflare text intelligence requires CF_ACCOUNT_ID and CLOUDFLARE_AI_API_TOKEN.");
  }
  return new DeterministicTextIntelligenceProvider();
}
