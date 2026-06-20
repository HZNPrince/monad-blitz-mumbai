import { describe, expect, it, vi } from "vitest";

import type { ProductDna } from "@/lib/product-dna";
import { CloudflareTextIntelligenceProvider, createTextIntelligenceProvider } from "./text-intelligence";

const base: ProductDna = {
  identity: { name: "Aegis", description: "Security signals.", domain: "aegis.example", colors: [] },
  products: [{ name: "Aegis" }], features: [], benefits: [], audiences: [], pricing: [], painPoints: [], differentiators: [], images: [], testimonials: [], offers: [], claims: [], existingContent: [], callsToAction: [], opportunities: [], sourcePages: ["https://aegis.example/"], extractedAt: "2026-06-20T00:00:00.000Z",
};

const intelligence = {
  description: "Aegis alerts security teams before risk spreads.",
  features: [{ value: "Monitors critical signals", source: "Homepage" }],
  benefits: [{ value: "Respond before incidents spread", source: "Homepage" }],
  audiences: [{ value: "Security teams", source: "Homepage" }],
  painPoints: [], differentiators: [], callsToAction: [],
  opportunities: [{ id: "early-warning", title: "See risk sooner", description: "Lead with early warning.", format: "Visual post", evidence: "Respond before incidents spread" }],
};

describe("text intelligence providers", () => {
  it("uses deterministic local inference when credentials are absent", () => {
    expect(createTextIntelligenceProvider({}).mode).toBe("local");
  });

  it("validates and merges Cloudflare JSON output", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ success: true, result: { response: intelligence } }), { status: 200 }));
    const provider = new CloudflareTextIntelligenceProvider("account", "token", undefined, fetchImpl as typeof fetch);
    const result = await provider.enhance({ productDna: base, cleanedEvidence: "Monitors critical signals." });
    expect(result.features[0]?.value).toBe("Monitors critical signals");
    expect(result.opportunities[0]?.id).toBe("early-warning");
  });

  it("makes one repair retry for malformed structured output", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true, result: { response: "not-json" } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true, result: { response: intelligence } }), { status: 200 }));
    const provider = new CloudflareTextIntelligenceProvider("account", "token", undefined, fetchImpl as typeof fetch);
    await expect(provider.enhance({ productDna: base, cleanedEvidence: "Evidence" })).resolves.toMatchObject({ identity: { name: "Aegis" } });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
