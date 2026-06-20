import "server-only";

import type { EvidenceItem, Product, ProductDna } from "./product-dna";
import {
  assertPublicWebsiteUrl,
  normalizeWebsiteUrl,
} from "@/server/security/url-safety";
import { createTextIntelligenceProvider } from "@/server/providers/text-intelligence";

const MAX_PAGES = 4;
const MAX_BYTES = 1_500_000;
const FETCH_TIMEOUT_MS = 8_000;
const TOTAL_TIMEOUT_MS = 22_000;
const MAX_SCRIPT_BYTES = 1_000_000;
const SIGNAL_PATHS = /\b(product|products|pricing|features|solutions|use-cases|about|customers|blog|launch|shop)\b/i;
const CONVENTIONAL_PATHS = ["/product", "/products", "/features", "/pricing", "/solutions", "/use-cases", "/about"];

type Page = {
  url: string;
  html: string;
  title: string;
  description: string;
  text: string;
  truncated: boolean;
};

type IngestionDependencies = {
  fetchImpl?: typeof fetch;
  resolver?: import("@/server/security/url-safety").HostResolver;
  now?: () => number;
};

function decodeEntities(value: string) {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&nbsp;/gi, " ")
    .replace(/&#(\d+);/g, (_, code: string) =>
      String.fromCharCode(Number(code)),
    );
}

function clean(value: string) {
  return decodeEntities(value.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function unique<T>(items: T[], key: (item: T) => string, limit: number) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const normalized = key(item).toLowerCase().trim();
    if (!normalized || seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  }).slice(0, limit);
}

function meta(html: string, key: string) {
  const tags = html.match(/<meta\b[^>]*>/gi) ?? [];
  for (const tag of tags) {
    const property = tag.match(/(?:name|property)=["']([^"']+)["']/i)?.[1];
    if (property?.toLowerCase() !== key.toLowerCase()) continue;
    return clean(tag.match(/content=["']([^"']*)["']/i)?.[1] ?? "");
  }
  return "";
}

function attr(tag: string, name: string) {
  return decodeEntities(
    tag.match(new RegExp(`${name}=["']([^"']*)["']`, "i"))?.[1] ?? "",
  );
}

function toAbsolute(value: string, base: string) {
  try {
    return new URL(value, base).href;
  } catch {
    return "";
  }
}

function sentences(text: string) {
  return text
    .split(/(?<=[.!?])\s+|\s*[•|]\s*/)
    .map((item) => clean(item))
    .filter((item) => item.length >= 24 && item.length <= 240);
}

function sourceLabel(page: Page) {
  const path = new URL(page.url).pathname;
  return path === "/" ? "Homepage" : path.replace(/^\//, "").replace(/[-/]/g, " ");
}

function evidence(pages: Page[], pattern: RegExp, limit: number): EvidenceItem[] {
  return unique(
    pages.flatMap((page) =>
      sentences(page.text)
        .filter((sentence) => pattern.test(sentence))
        .map((value) => ({ value, source: sourceLabel(page) })),
    ),
    (item) => item.value,
    limit,
  );
}

export async function readBoundedBody(response: Response, maxBytes = MAX_BYTES) {
  const reader = response.body?.getReader();
  if (!reader) return { html: "", truncated: false };
  const chunks: Uint8Array[] = [];
  let total = 0;
  let truncated = false;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const remaining = maxBytes - total;
    if (value.byteLength > remaining) {
      if (remaining > 0) chunks.push(value.subarray(0, remaining));
      total = maxBytes;
      truncated = true;
      await reader.cancel();
      break;
    }
    total += value.byteLength;
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { html: new TextDecoder().decode(bytes), truncated };
}

async function fetchHtml(initialUrl: URL, dependencies: IngestionDependencies = {}) {
  const fetchImpl = dependencies.fetchImpl ?? fetch;
  let current = initialUrl;
  for (let redirects = 0; redirects <= 2; redirects += 1) {
    await assertPublicWebsiteUrl(current, dependencies.resolver);
    const response = await fetchImpl(current, {
      redirect: "manual",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        accept: "text/html,application/xhtml+xml;q=0.9,application/json;q=0.5,*/*;q=0.1",
        "accept-language": "en-US,en;q=0.9",
        "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36 TractionBot/1.0",
      },
      cache: "no-store",
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) throw new Error("The website returned an invalid redirect.");
      current = new URL(location, current);
      continue;
    }
    if (!response.ok && ![401, 403, 429].includes(response.status)) {
      throw new Error(`The website returned ${response.status}. Try another public page.`);
    }
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
      throw new Error("That URL does not return a web page.");
    }
    const declaredLength = Number(response.headers.get("content-length") ?? 0);
    const bounded = await readBoundedBody(response);
    return {
      ...bounded,
      truncated: bounded.truncated || declaredLength > MAX_BYTES,
      restricted: !response.ok,
      finalUrl: current.href,
    };
  }
  throw new Error("The website redirected too many times.");
}

async function fetchPublicScript(url: URL, dependencies: IngestionDependencies = {}) {
  await assertPublicWebsiteUrl(url, dependencies.resolver);
  const response = await (dependencies.fetchImpl ?? fetch)(url, {
    redirect: "error",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: {
      accept: "application/javascript,text/javascript;q=0.9,*/*;q=0.1",
      "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36 TractionBot/1.0",
    },
    cache: "no-store",
  });
  if (!response.ok) throw new Error("The public application shell was unavailable.");
  const contentType = response.headers.get("content-type") ?? "";
  if (!/(?:java|ecma)script|text\/plain/i.test(contentType)) throw new Error("The application shell was not JavaScript.");
  return (await readBoundedBody(response, MAX_SCRIPT_BYTES)).html;
}

function scriptShellUrl(page: Page) {
  const origin = new URL(page.url).origin;
  return (page.html.match(/<script\b[^>]*src=["'][^"']+["'][^>]*>/gi) ?? [])
    .map((tag) => toAbsolute(attr(tag, "src"), page.url))
    .find((value) => value && new URL(value).origin === origin);
}

function humanStringsFromScript(script: string) {
  const values = [...script.matchAll(/["'`]([^"'`\\]{18,240})["'`]/g)]
    .map((match) => clean(match[1]))
    .filter((value) => {
      if (value.split(/\s+/).length < 3 || !/[A-Za-z]{4}\s+[A-Za-z]{3}/.test(value)) return false;
      if (/^(?:https?:|[\w$]+\s*[=:({[]|[\w-]+:\s*\w)/.test(value)) return false;
      const letters = (value.match(/[A-Za-z]/g) ?? []).length;
      return letters / value.length > 0.55;
    });
  return unique(values, (value) => value, 180).join(". ").slice(0, 60_000);
}

function pageFromHtml(url: string, html: string, truncated = false): Page {
  const title =
    meta(html, "og:title") || clean(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "");
  const description =
    meta(html, "og:description") || meta(html, "description") || meta(html, "twitter:description");
  const withoutNoise = html
    .replace(/<(script|style|noscript|svg)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--([\s\S]*?)-->/g, " ");
  return { url, html, title, description, text: clean(withoutNoise).slice(0, 100_000), truncated };
}

function highSignalLinks(page: Page) {
  const origin = new URL(page.url).origin;
  return unique(
    (page.html.match(/<a\b[^>]*href=["'][^"']+["'][^>]*>/gi) ?? [])
      .map((tag) => toAbsolute(attr(tag, "href"), page.url))
      .filter((href) => {
        if (!href) return false;
        const url = new URL(href);
        return url.origin === origin && SIGNAL_PATHS.test(url.pathname);
      }),
    (href) => href,
    MAX_PAGES - 1,
  );
}

function crawlCandidates(page: Page) {
  const root = new URL(page.url);
  return unique(
    [
      ...highSignalLinks(page),
      ...CONVENTIONAL_PATHS.map((path) => new URL(path, root.origin).href),
    ],
    (href) => href,
    MAX_PAGES - 1,
  );
}

function jsonLd(html: string) {
  const blocks = html.match(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi) ?? [];
  return blocks.flatMap((block) => {
    const raw = block.replace(/^<script\b[^>]*>/i, "").replace(/<\/script>$/i, "").trim();
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      return [];
    }
  });
}

function walkJson(value: unknown, visit: (record: Record<string, unknown>) => void) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((item) => walkJson(item, visit));
    return;
  }
  const record = value as Record<string, unknown>;
  visit(record);
  Object.values(record).forEach((item) => walkJson(item, visit));
}

function productsFromPages(pages: Page[]): Product[] {
  const products: Product[] = [];
  for (const page of pages) {
    for (const block of jsonLd(page.html)) {
      walkJson(block, (record) => {
        const type = record["@type"];
        if (type !== "Product" && !(Array.isArray(type) && type.includes("Product"))) return;
        const offers = typeof record.offers === "object" && record.offers ? record.offers as Record<string, unknown> : {};
        const image = Array.isArray(record.image) ? record.image[0] : record.image;
        products.push({
          name: clean(String(record.name ?? "")),
          description: clean(String(record.description ?? "")) || undefined,
          price: offers.price ? `${offers.priceCurrency ?? "$"}${offers.price}` : undefined,
          image: typeof image === "string" ? toAbsolute(image, page.url) : undefined,
        });
      });
    }
  }
  return unique(products, (item) => item.name, 8);
}

function imagesFromPages(pages: Page[]) {
  return unique(
    pages.flatMap((page) => {
      const social = [meta(page.html, "og:image"), meta(page.html, "twitter:image")]
        .filter(Boolean)
        .map((url) => ({ url: toAbsolute(url, page.url), alt: page.title || "Product preview" }));
      const images = (page.html.match(/<img\b[^>]*>/gi) ?? []).map((tag) => ({
        url: toAbsolute(
          attr(tag, "src")
            || attr(tag, "data-src")
            || attr(tag, "srcset").split(",")[0]?.trim().split(/\s+/)[0]
            || attr(tag, "data-srcset").split(",")[0]?.trim().split(/\s+/)[0],
          page.url,
        ),
        alt: clean(attr(tag, "alt")) || "Website image",
      }));
      const icons = (page.html.match(/<link\b[^>]*rel=["'][^"']*(?:icon|apple-touch-icon)[^"']*["'][^>]*>/gi) ?? [])
        .map((tag) => ({ url: toAbsolute(attr(tag, "href"), page.url), alt: "Brand icon" }));
      const structuredImages: Array<{ url: string; alt: string }> = [];
      for (const block of jsonLd(page.html)) {
        walkJson(block, (record) => {
          const candidates = [record.image, record.logo].flatMap((value) => Array.isArray(value) ? value : [value]);
          for (const candidate of candidates) {
            const raw = typeof candidate === "string"
              ? candidate
              : candidate && typeof candidate === "object"
                ? String((candidate as Record<string, unknown>).url ?? (candidate as Record<string, unknown>).contentUrl ?? "")
                : "";
            if (raw) structuredImages.push({ url: toAbsolute(raw, page.url), alt: clean(String(record.name ?? "Product image")) });
          }
        });
      }
      return [...social, ...structuredImages, ...images, ...icons];
    }).filter((image) => image.url && !image.url.startsWith("data:")),
    (item) => item.url,
    10,
  );
}

function colorsFromHtml(html: string) {
  const values = html.match(/#[0-9a-f]{6}\b/gi) ?? [];
  const ignored = new Set(["#ffffff", "#000000", "#fffFFF"]);
  return unique(values.filter((value) => !ignored.has(value.toLowerCase())), (value) => value, 5);
}

function linkTextEvidence(pages: Page[], pattern: RegExp, limit: number) {
  return unique(
    pages.flatMap((page) =>
      (page.html.match(/<(a|button)\b[^>]*>[\s\S]*?<\/\1>/gi) ?? [])
        .map((tag) => clean(tag))
        .filter((value) => value.length >= 2 && value.length <= 72 && pattern.test(value))
        .map((value) => ({ value, source: sourceLabel(page) })),
    ),
    (item) => item.value,
    limit,
  );
}

function inferOpportunities(input: {
  name: string;
  products: Product[];
  features: EvidenceItem[];
  benefits: EvidenceItem[];
  pricing: EvidenceItem[];
  offers: EvidenceItem[];
  content: EvidenceItem[];
  audiences: EvidenceItem[];
  description: string;
  ctas: EvidenceItem[];
}) {
  const product = input.products[0]?.name ?? input.name;
  const candidates: ProductDna["opportunities"] = [];
  if (input.benefits[0]) candidates.push({
      id: "customer-outcome",
      title: `${product}: lead with the outcome`,
      description: "Turn the strongest observed customer outcome into a concise visual launch.",
      format: "Visual post",
      evidence: input.benefits[0].value,
    });
  if (input.features[0]) candidates.push({
      id: "product-mechanism",
      title: `Show how ${product} works`,
      description: "Explain one observed capability without adding unsupported claims.",
      format: "Visual explainer",
      evidence: input.features[0].value,
    });
  if (input.audiences[0]) candidates.push({
      id: "audience-callout",
      title: `For ${input.audiences[0].value.slice(0, 54)}`,
      description: "Use the audience language already present on the site.",
      format: "Audience post",
      evidence: input.audiences[0].value,
    });
  if (input.offers[0] || input.pricing[0]) candidates.push({
      id: input.offers[0] ? "current-offer" : "pricing-proof",
      title: input.offers[0] ? `Share ${product}'s current offer` : `Make ${product}'s pricing clear`,
      description: "Present only the commercial terms found in the source evidence.",
      format: "Offer card",
      evidence: (input.offers[0] ?? input.pricing[0]).value,
    });
  if (input.content[0]) candidates.push({
      id: "repurpose-content",
      title: `Repurpose ${input.content[0].value.slice(0, 60)}`,
      description: "Adapt an existing source page into a platform-native visual.",
      format: "Content remix",
      evidence: input.content[0].value,
    });
  if (input.description) candidates.push({
      id: "positioning",
      title: `What ${product} is built for`,
      description: "Use the site's own positioning as the campaign anchor.",
      format: "Positioning card",
      evidence: input.description,
    });
  if (input.ctas[0]) candidates.push({
      id: "action",
      title: `${product}: ${input.ctas[0].value}`,
      description: "Pair the site's real call to action with its clearest product message.",
      format: "Action card",
      evidence: input.ctas[0].value,
    });
  return unique(candidates, (item) => item.id, 4);
}

export async function analyzeWebsite(
  rawUrl: string,
  dependencies: IngestionDependencies = {},
): Promise<ProductDna> {
  const now = dependencies.now ?? Date.now;
  const deadline = now() + TOTAL_TIMEOUT_MS;
  const initial = normalizeWebsiteUrl(rawUrl);
  const warnings: string[] = [];
  let root: Page;
  try {
    const rootResponse = await fetchHtml(initial, dependencies);
    root = pageFromHtml(rootResponse.finalUrl, rootResponse.html, rootResponse.truncated);
    if (rootResponse.truncated) warnings.push("Homepage was larger than the safe read limit; usable evidence was extracted from a bounded prefix.");
    if (rootResponse.restricted) warnings.push("The site restricted automated access; the profile uses its safely available public shell.");
  } catch (error) {
    warnings.push(error instanceof Error ? error.message : "The homepage could not be read.");
    root = pageFromHtml(initial.href, `<title>${initial.hostname}</title>`, false);
  }
  if (root.text.length < 180 && now() < deadline) {
    const shellUrl = scriptShellUrl(root);
    if (shellUrl) {
      try {
        const shellText = humanStringsFromScript(await fetchPublicScript(new URL(shellUrl), dependencies));
        if (shellText.length >= 80) {
          root.text = `${root.text} ${shellText}`.slice(0, 100_000);
          warnings.push("The visible site was a JavaScript shell; public bundled copy was read without executing it.");
        }
      } catch {
        // Public script shells are optional evidence and never block the analysis.
      }
    }
  }
  const pages = [root];
  const candidates = crawlCandidates(root);
  for (const href of candidates) {
    if (now() >= deadline) {
      warnings.push("The analysis time budget ended before every candidate page was read.");
      break;
    }
    try {
      const response = await fetchHtml(new URL(href), dependencies);
      pages.push(pageFromHtml(response.finalUrl, response.html, response.truncated));
      if (response.truncated) warnings.push(`${new URL(response.finalUrl).pathname} was partially read.`);
    } catch {
      // Child-page failures are expected on guessed paths and never fail the profile.
    }
  }
  const structured = pages.flatMap((page) => jsonLd(page.html));
  let organizationName = "";
  let structuredLogo = "";
  structured.forEach((block) => walkJson(block, (record) => {
    const type = record["@type"];
    if (["Organization", "SoftwareApplication", "WebSite"].includes(String(type))) {
      organizationName ||= clean(String(record.name ?? ""));
      const logo = typeof record.logo === "string" ? record.logo : "";
      structuredLogo ||= logo ? toAbsolute(logo, root.url) : "";
    }
  }));

  const name = meta(root.html, "og:site_name") || organizationName || root.title.split(/[|—–-]/)[0].trim() || initial.hostname;
  const products = productsFromPages(pages);
  const titleDescriptor = root.title.split(/[|—–-]/).slice(1).join(" ").trim();
  const inferredDescription = root.description
    || titleDescriptor
    || sentences(root.text).find((sentence) => /\b(product|platform|dashboard|agent|tool|monitor|watch|protect|manage|lending|campaign)\b/i.test(sentence))
    || "";
  if (!products.length) {
    products.push({ name, description: inferredDescription || undefined });
  }
  const features = evidence(pages, /\b(feature|include|built|integrat|automat|track|connect|support|create|publish|detect|monitor|protect|manage|alert|warn|risk|health|liquidat|repay|platform|tool)\w*\b/i, 8);
  const benefits = evidence(pages, /\b(save|grow|increase|improve|faster|easier|without|before|so you can|help\w*|reduce|more|secure|protect|prevent|confidence|visibility|control)\w*\b/i, 8);
  const audiences = evidence(pages, /\b(for (?:teams|founders|creators|developers|marketers|businesses|brands|agencies|you|families|parents|enterprises|security teams|traders|investors|lenders|borrowers|solana users)|built for|designed for|whether you|teams? who|companies? that|your (?:solana |defi |crypto )?(?:lending )?positions)\b/i, 6);
  const pricing = evidence(pages, /(?:[$€£]\s?\d+|\d+\s?(?:usd|usdc)|per month|\/month|pricing|free plan|annual)/i, 6);
  const painPoints = evidence(pages, /\b(problem|struggl|manual|waste|slow|difficult|fragment|expensive|overwhelm|without)\w*\b/i, 6);
  const differentiators = evidence(pages, /\b(unlike|only|unique|first|instead|different|open source|proprietary|native)\b/i, 6);
  const testimonials = evidence(pages, /(?:“[^”]+”|"[^"]+"|\b(?:love|recommend|changed|saved us|results?)\b)/i, 5);
  const offers = evidence(pages, /\b(free trial|free forever|discount|limited offer|early access|waitlist|money.back|guarantee)\b/i, 5);
  const existingContent = unique(
    pages.flatMap((page) =>
      SIGNAL_PATHS.test(new URL(page.url).pathname)
        ? [{ value: page.title || sourceLabel(page), source: sourceLabel(page) }]
        : [],
    ),
    (item) => item.value,
    6,
  );
  const callsToAction = linkTextEvidence(pages, /\b(start|try|get|join|book|buy|shop|learn|sign|download|contact|launch)\b/i, 8);
  const claims = evidence(pages, /(?:\b\d+(?:\.\d+)?%|\b#1\b|\bbest\b|\bfastest\b|\bleading\b|\bguarantee\w*)/i, 8)
    .map((item) => ({ ...item, support: /(?:case study|customers?|review|data|report)/i.test(item.value) ? "supported" as const : "review" as const }));
  const images = imagesFromPages(pages);
  const logo = structuredLogo || meta(root.html, "og:logo") || images.find((image) => /logo/i.test(image.alt))?.url;
  const opportunities = inferOpportunities({
    name,
    products,
    features,
    benefits,
    pricing,
    offers,
    content: existingContent,
    audiences,
    description: inferredDescription || products[0]?.description || "",
    ctas: callsToAction,
  });

  const productDna: ProductDna = {
    identity: {
      name,
      description: inferredDescription || products[0]?.description || `Product profile for ${initial.hostname}.`,
      domain: new URL(root.url).hostname,
      colors: colorsFromHtml(root.html),
      logo,
    },
    products,
    features,
    benefits,
    audiences,
    pricing,
    painPoints,
    differentiators,
    images,
    testimonials,
    offers,
    claims,
    existingContent,
    callsToAction,
    opportunities,
    sourcePages: pages.map((page) => page.url),
    extractedAt: new Date().toISOString(),
    analysis: {
      partial: warnings.length > 0 || pages.some((page) => page.truncated),
      warnings: unique(warnings, (warning) => warning, 8),
      pagesAttempted: 1 + candidates.length,
      pagesRead: pages.length,
    },
  };
  try {
    return await createTextIntelligenceProvider().enhance({
      productDna,
      cleanedEvidence: pages
        .map((page) => `[${sourceLabel(page)} | ${page.url}]\n${page.title}\n${page.description}\n${page.text}`)
        .join("\n\n")
        .slice(0, 30_000),
    });
  } catch (error) {
    productDna.analysis = {
      ...productDna.analysis!,
      partial: true,
      warnings: [
        ...productDna.analysis!.warnings,
        error instanceof Error ? `Text intelligence unavailable: ${error.message}` : "Text intelligence unavailable.",
      ],
    };
    return productDna;
  }
}
