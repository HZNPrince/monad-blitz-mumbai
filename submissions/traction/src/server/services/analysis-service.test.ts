import { describe, expect, it } from "vitest";

import type { ProductDna } from "@/lib/product-dna";
import { AnalysisService } from "@/server/services/analysis-service";

const dna: ProductDna = {
  identity: { name: "Aegis", description: "Detect incidents before users report them.", domain: "aegis.example", colors: [] },
  products: [{ name: "Aegis", description: "Incident monitoring" }],
  pricing: [], offers: [],
  audiences: [{ value: "engineering teams", source: "Homepage" }],
  painPoints: [],
  features: [{ value: "real-time incident alerts", source: "Homepage" }],
  benefits: [{ value: "respond before users report issues", source: "Homepage" }],
  differentiators: [], images: [], testimonials: [], claims: [], existingContent: [],
  callsToAction: [{ value: "Start monitoring", source: "Homepage" }],
  opportunities: [{ id: "incident", title: "Respond before the report", description: "Show the response advantage.", format: "Single post", evidence: "respond before users report issues" }],
  sourcePages: ["https://aegis.example/"],
  extractedAt: new Date().toISOString(),
  analysis: { partial: false, warnings: [], pagesAttempted: 1, pagesRead: 1 },
};

describe("AnalysisService", () => {
  it("moves real analysis through generation into a ready job", async () => {
    const generations = {
      createJob: async () => ({
        job: { status: "SUCCEEDED", error: undefined },
        creatives: [{ id: "creative_1" }],
      }),
    };
    const service = new AnalysisService(
      async () => dna,
      generations as never,
    );
    const job = service.create("aegis.example", "owner");
    await service.run(job.id);
    const completed = service.get(job.id, "owner");
    expect(completed?.status).toBe("READY");
    expect(completed?.message).toBe("Your campaign stack is ready");
    expect(completed?.creatives).toHaveLength(1);
  });
});
