import { describe, expect, it, vi } from "vitest";

import {
  CloudflareWorkersAiProvider,
  DeterministicLocalImageProvider,
  createImageGenerationProvider,
  type ImageGenerationInput,
} from "./image-generation";

const input: ImageGenerationInput = {
  prompt: "A precise product launch image.",
  seed: 42,
  width: 1200,
  height: 675,
  sourceAssets: [],
  headline: "Ship with traction",
  subhead: "Distribution that learns from verified outcomes.",
  cta: "See the loop",
  colors: ["#C7E85B", "#10110D"],
};

describe("image generation providers", () => {
  it("produces deterministic, visibly local SVG output", async () => {
    const provider = new DeterministicLocalImageProvider();
    const first = await provider.generate(input);
    const second = await provider.generate(input);
    expect(first.imageDataUrl).toBe(second.imageDataUrl);
    expect(first.providerMode).toBe("local");
    expect(
      Buffer.from(first.imageDataUrl.split(",")[1], "base64").toString(),
    ).toContain("PREVIEW MODE");
  });

  it("falls back locally when credentials are absent", () => {
    expect(createImageGenerationProvider({}).mode).toBe("local");
  });

  it("requires credentials when live mode is explicitly requested", () => {
    expect(() =>
      createImageGenerationProvider({ IMAGE_GENERATION_PROVIDER: "cloudflare" }),
    ).toThrow(/requires CF_ACCOUNT_ID/);
  });

  it("parses a successful Cloudflare response", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({ success: true, result: { image: "aW1hZ2U=" } }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    const provider = new CloudflareWorkersAiProvider(
      "account",
      "token",
      undefined,
      fetchImpl as typeof fetch,
    );
    const output = await provider.generate(input);
    expect(output.imageDataUrl).toBe("data:image/png;base64,aW1hZ2U=");
    expect(output.providerMode).toBe("live");
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("does not fake success on a Cloudflare API failure", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          success: false,
          errors: [{ message: "quota exhausted" }],
        }),
        { status: 429, headers: { "content-type": "application/json" } },
      ),
    );
    const provider = new CloudflareWorkersAiProvider(
      "account",
      "token",
      undefined,
      fetchImpl as typeof fetch,
    );
    await expect(provider.generate(input)).rejects.toThrow("quota exhausted");
  });
});
