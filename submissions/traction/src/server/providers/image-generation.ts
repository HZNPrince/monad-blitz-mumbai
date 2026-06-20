import { createHash } from "node:crypto";

import { z } from "zod";

export type ImageGenerationInput = {
  prompt: string;
  seed: number;
  width: number;
  height: number;
  sourceAssets: string[];
  headline: string;
  subhead: string;
  cta: string;
  colors: string[];
};

export type ImageGenerationOutput = {
  imageDataUrl: string;
  mediaType: string;
  width: number;
  height: number;
  provider: string;
  providerMode: "live" | "local";
  model: string;
  seed: number;
  options: Record<string, unknown>;
};

export interface ImageGenerationProvider {
  readonly name: string;
  readonly mode: "live" | "local";
  readonly model: string;
  generate(input: ImageGenerationInput): Promise<ImageGenerationOutput>;
}

function escapeXml(value: string) {
  return value.replace(/[<>&'"]/g, (character) => ({
    "<": "&lt;",
    ">": "&gt;",
    "&": "&amp;",
    "'": "&apos;",
    '"': "&quot;",
  })[character] ?? character);
}

function wrap(value: string, max = 34) {
  const words = value.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > max && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, 3);
}

export class DeterministicLocalImageProvider
implements ImageGenerationProvider {
  readonly name = "local-deterministic";
  readonly mode = "local" as const;
  readonly model = "traction-light-preview-svg-v2";

  async generate(input: ImageGenerationInput): Promise<ImageGenerationOutput> {
    const primary = input.colors[0] ?? "#C7E85B";
    const background = "#F6F6F1";
    const headlineLines = wrap(input.headline);
    const headline = headlineLines
      .map(
        (line, index) =>
          `<text x="76" y="${194 + index * 64}" fill="#171914" font-family="Arial, sans-serif" font-size="56" font-weight="700">${escapeXml(line)}</text>`,
      )
      .join("");
    const signature = createHash("sha256")
      .update(`${input.prompt}:${input.seed}`)
      .digest("hex")
      .slice(0, 12);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${input.width}" height="${input.height}" viewBox="0 0 ${input.width} ${input.height}">
<rect width="100%" height="100%" fill="${background}"/>
<rect x="24" y="24" width="${input.width - 48}" height="${input.height - 48}" rx="8" fill="#FFFFFF" stroke="#D9DDD4"/>
<rect x="76" y="74" width="92" height="8" rx="4" fill="${primary}"/>
<text x="76" y="122" fill="#6B7067" font-size="18" font-family="Arial, sans-serif" letter-spacing="1">PREVIEW MODE</text>
<circle cx="${input.width - 132}" cy="126" r="44" fill="${primary}" opacity="0.82"/>
${headline}
<text x="76" y="${400 + Math.max(0, headlineLines.length - 1) * 36}" fill="#62675F" font-family="Arial, sans-serif" font-size="27">${escapeXml(input.subhead.slice(0, 92))}</text>
<rect x="76" y="${input.height - 124}" width="210" height="52" rx="6" fill="#171914"/>
<text x="98" y="${input.height - 90}" fill="#FFFFFF" font-family="Arial, sans-serif" font-size="21" font-weight="700">${escapeXml(input.cta)}</text>
<text x="${input.width - 230}" y="${input.height - 84}" fill="#9A9F96" font-size="15" font-family="Arial, sans-serif">${signature}</text>
</svg>`;
    const imageDataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
    return {
      imageDataUrl,
      mediaType: "image/svg+xml",
      width: input.width,
      height: input.height,
      provider: this.name,
      providerMode: this.mode,
      model: this.model,
      seed: input.seed,
      options: { deterministic: true, signature },
    };
  }
}

const cloudflareResponseSchema = z.object({
  success: z.boolean(),
  result: z.object({ image: z.string().min(1) }).optional(),
  errors: z.array(z.object({ message: z.string().optional() })).optional(),
});

export class CloudflareWorkersAiProvider implements ImageGenerationProvider {
  readonly name = "cloudflare-workers-ai";
  readonly mode = "live" as const;
  readonly model: string;

  constructor(
    private readonly accountId: string,
    private readonly apiToken: string,
    model = "@cf/black-forest-labs/flux-1-schnell",
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    this.model = model;
  }

  async generate(input: ImageGenerationInput): Promise<ImageGenerationOutput> {
    const response = await this.fetchImpl(
      `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/ai/run/${this.model}`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.apiToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          prompt: input.prompt.slice(0, 2_048),
          seed: input.seed,
          steps: 4,
        }),
        signal: AbortSignal.timeout(45_000),
      },
    );
    const payload = cloudflareResponseSchema.parse(await response.json());
    if (!response.ok || !payload.success || !payload.result?.image) {
      throw new Error(
        payload.errors?.[0]?.message ?? "Cloudflare image generation failed.",
      );
    }
    return {
      imageDataUrl: `data:image/png;base64,${payload.result.image}`,
      mediaType: "image/png",
      width: input.width,
      height: input.height,
      provider: this.name,
      providerMode: this.mode,
      model: this.model,
      seed: input.seed,
      options: { steps: 4 },
    };
  }
}

export function createImageGenerationProvider(
  env: Record<string, string | undefined> = process.env,
): ImageGenerationProvider {
  const requested = env.IMAGE_GENERATION_PROVIDER;
  if (requested === "local") return new DeterministicLocalImageProvider();
  if (env.CF_ACCOUNT_ID && env.CLOUDFLARE_AI_API_TOKEN) {
    return new CloudflareWorkersAiProvider(
      env.CF_ACCOUNT_ID,
      env.CLOUDFLARE_AI_API_TOKEN,
      env.CLOUDFLARE_AI_MODEL,
    );
  }
  if (requested === "cloudflare") {
    throw new Error(
      "Cloudflare generation requires CF_ACCOUNT_ID and CLOUDFLARE_AI_API_TOKEN.",
    );
  }
  return new DeterministicLocalImageProvider();
}
