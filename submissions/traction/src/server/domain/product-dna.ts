import { z } from "zod";

import type { ProductDna } from "@/lib/product-dna";

export const provenanceSchema = z.object({
  sourceUrl: z.string().url(),
  sourceLabel: z.string().min(1),
  observedAt: z.string().datetime(),
  method: z.enum(["meta", "json-ld", "text", "image", "derived", "user"]),
  confidence: z.number().min(0).max(1),
});

export const evidenceValueSchema = z.object({
  value: z.string().min(1),
  provenance: z.array(provenanceSchema).min(1),
});

export const productSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  sku: z.string().optional(),
  price: z.string().optional(),
  imageUrl: z.string().url().optional(),
  provenance: z.array(provenanceSchema).min(1),
});

export const productDnaRecordSchema = z.object({
  id: z.string().min(1),
  ownerId: z.string().min(1),
  revision: z.number().int().positive(),
  identity: z.object({
    name: z.string().min(1),
    description: z.string(),
    domain: z.string().min(1),
    colors: z.array(z.string()),
    logoUrl: z.string().url().optional(),
    provenance: z.array(provenanceSchema).min(1),
  }),
  products: z.array(productSchema),
  pricingAndOffers: z.array(evidenceValueSchema),
  audiences: z.array(evidenceValueSchema),
  painPoints: z.array(evidenceValueSchema),
  features: z.array(evidenceValueSchema),
  benefits: z.array(evidenceValueSchema),
  differentiators: z.array(evidenceValueSchema),
  visualAssets: z.array(
    z.object({
      url: z.string().url(),
      alt: z.string(),
      provenance: z.array(provenanceSchema).min(1),
    }),
  ),
  testimonialsAndProof: z.array(evidenceValueSchema),
  voice: z.object({
    summary: z.string(),
    provenance: z.array(provenanceSchema).min(1),
  }),
  claims: z.object({
    allowed: z.array(evidenceValueSchema),
    unsupported: z.array(evidenceValueSchema),
  }),
  existingContent: z.array(evidenceValueSchema),
  callsToAction: z.array(evidenceValueSchema),
  campaignAngles: z.array(
    z.object({
      id: z.string().min(1),
      title: z.string().min(1),
      description: z.string().min(1),
      format: z.string().min(1),
      evidence: z.string().min(1),
      provenance: z.array(provenanceSchema).min(1),
    }),
  ),
  sourcePages: z.array(z.string().url()).min(1),
  extractedAt: z.string().datetime(),
});

export type ProductDnaRecord = z.infer<typeof productDnaRecordSchema>;

function stableId(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function canonicalizeProductDna(
  dna: ProductDna,
  ownerId = "local-user",
): ProductDnaRecord {
  const rootUrl = dna.sourcePages[0] ?? `https://${dna.identity.domain}`;
  const observedAt = dna.extractedAt;
  const provenance = (
    sourceLabel: string,
    method: z.infer<typeof provenanceSchema>["method"] = "text",
    confidence = 0.75,
  ) => [{
    sourceUrl: rootUrl,
    sourceLabel,
    observedAt,
    method,
    confidence,
  }];
  const evidence = (
    items: Array<{ value: string; source: string }>,
    confidence = 0.72,
  ) =>
    items.map((item) => ({
      value: item.value,
      provenance: provenance(item.source, "text", confidence),
    }));

  return productDnaRecordSchema.parse({
    id: `dna_${stableId(`${dna.identity.domain}:${dna.extractedAt}`)}`,
    ownerId,
    revision: 1,
    identity: {
      name: dna.identity.name,
      description: dna.identity.description,
      domain: dna.identity.domain,
      colors: dna.identity.colors,
      logoUrl: dna.identity.logo,
      provenance: provenance("Homepage", "meta", 0.85),
    },
    products: dna.products.map((product) => ({
      name: product.name,
      description: product.description,
      price: product.price,
      imageUrl: product.image,
      provenance: provenance(
        product.name,
        product.price || product.image ? "json-ld" : "derived",
        product.price || product.image ? 0.9 : 0.58,
      ),
    })),
    pricingAndOffers: evidence([...dna.pricing, ...dna.offers]),
    audiences: evidence(dna.audiences, 0.66),
    painPoints: evidence(dna.painPoints, 0.64),
    features: evidence(dna.features),
    benefits: evidence(dna.benefits, 0.68),
    differentiators: evidence(dna.differentiators, 0.65),
    visualAssets: dna.images.map((image) => ({
      url: image.url,
      alt: image.alt,
      provenance: provenance(image.alt || "Website image", "image", 0.9),
    })),
    testimonialsAndProof: evidence(dna.testimonials, 0.7),
    voice: {
      summary: `Use the concise, product-led language observed on ${dna.identity.domain}.`,
      provenance: provenance("Observed website copy", "derived", 0.55),
    },
    claims: {
      allowed: evidence(
        dna.claims.filter((claim) => claim.support === "supported"),
        0.82,
      ),
      unsupported: evidence(
        dna.claims.filter((claim) => claim.support === "review"),
        0.45,
      ),
    },
    existingContent: evidence(dna.existingContent),
    callsToAction: evidence(dna.callsToAction),
    campaignAngles: dna.opportunities.map((angle) => ({
      ...angle,
      provenance: provenance("Derived from extracted Product DNA", "derived", 0.68),
    })),
    sourcePages: dna.sourcePages,
    extractedAt: dna.extractedAt,
  });
}
