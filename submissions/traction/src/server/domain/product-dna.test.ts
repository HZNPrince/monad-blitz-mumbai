import { describe, expect, it } from "vitest";

import { productDnaRecordSchema } from "./product-dna";

const provenance = {
  sourceUrl: "https://example.com/",
  sourceLabel: "Homepage",
  observedAt: "2026-06-20T00:00:00.000Z",
  method: "text" as const,
  confidence: 0.8,
};

const fixture = {
  id: "dna_example",
  ownerId: "owner",
  revision: 1,
  identity: {
    name: "Example",
    description: "A product.",
    domain: "example.com",
    colors: ["#10110D"],
    provenance: [provenance],
  },
  products: [],
  pricingAndOffers: [],
  audiences: [],
  painPoints: [],
  features: [],
  benefits: [],
  differentiators: [],
  visualAssets: [],
  testimonialsAndProof: [],
  voice: { summary: "Direct.", provenance: [provenance] },
  claims: { allowed: [], unsupported: [] },
  existingContent: [],
  callsToAction: [],
  campaignAngles: [],
  sourcePages: ["https://example.com/"],
  extractedAt: "2026-06-20T00:00:00.000Z",
};

describe("Product DNA schema", () => {
  it("accepts a source-aware record", () => {
    expect(productDnaRecordSchema.parse(fixture).identity.name).toBe("Example");
  });

  it("rejects confidence outside the zero-to-one range", () => {
    expect(() =>
      productDnaRecordSchema.parse({
        ...fixture,
        identity: {
          ...fixture.identity,
          provenance: [{ ...provenance, confidence: 1.1 }],
        },
      }),
    ).toThrow();
  });
});
