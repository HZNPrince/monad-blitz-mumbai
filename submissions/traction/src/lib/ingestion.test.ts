import { describe, expect, it, vi } from "vitest";

import { analyzeWebsite, readBoundedBody } from "./ingestion";

const publicResolver = async () => [{ address: "93.184.216.34", family: 4 }];

function htmlResponse(html: string, init: ResponseInit = {}) {
  return new Response(html, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8", ...init.headers },
    ...init,
  });
}

describe("resilient website ingestion", () => {
  it("bounds oversized HTML and returns a partial profile instead of failing", async () => {
    const head = '<title>Large Brand</title><meta name="description" content="Large Brand helps teams ship safer products.">';
    const response = htmlResponse(`${head}${"x".repeat(1_600_000)}`, {
      headers: { "content-type": "text/html", "content-length": "1600100" },
    });
    const dna = await analyzeWebsite("https://example.com", {
      fetchImpl: vi.fn(async () => response) as typeof fetch,
      resolver: publicResolver,
    });
    expect(dna.identity.name).toBe("Large Brand");
    expect(dna.analysis?.partial).toBe(true);
    expect(dna.analysis?.warnings.join(" ")).toMatch(/bounded prefix/);
  });

  it("keeps the exact maximum bytes and marks the stream truncated", async () => {
    const result = await readBoundedBody(new Response("abcdefghij"), 5);
    expect(result).toEqual({ html: "abcde", truncated: true });
  });

  it("extracts useful evidence and images from a sparse product page", async () => {
    const page = `<!doctype html><html><head>
      <title>Aegis Alert — Know before risk spreads</title>
      <meta property="og:site_name" content="Aegis Alert">
      <meta name="description" content="Aegis Alert monitors critical signals and alerts security teams before incidents spread.">
      <meta property="og:image" content="/hero.png">
      </head><body><h1>Know before risk spreads</h1>
      <p>Built for security teams that need faster visibility and control.</p>
      <p>Monitor critical signals and receive clear alerts without manual checks.</p>
      <a href="/features">Explore features</a><button>Start monitoring</button></body></html>`;
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      return url.pathname === "/" ? htmlResponse(page) : htmlResponse("<title>Features</title><p>Detect emerging risks and protect your team.</p>");
    });
    const dna = await analyzeWebsite("https://aegis.example", {
      fetchImpl: fetchImpl as typeof fetch,
      resolver: publicResolver,
    });
    expect(dna.features.length).toBeGreaterThan(0);
    expect(dna.benefits.length).toBeGreaterThan(0);
    expect(dna.audiences.length).toBeGreaterThan(0);
    expect(dna.images[0]?.url).toBe("https://aegis.example/hero.png");
    expect(dna.opportunities.every((angle) => !/pricing|founder/i.test(angle.title))).toBe(true);
  });

  it("uses metadata from a JavaScript shell and ignores malformed JSON-LD", async () => {
    const page = `<html><head><title>Signal AI</title>
      <meta property="og:description" content="Signal AI helps product teams understand customer feedback.">
      <script type="application/ld+json">{not valid json</script>
      </head><body><div id="root"></div></body></html>`;
    const dna = await analyzeWebsite("https://signal.example", {
      fetchImpl: vi.fn(async () => htmlResponse(page)) as typeof fetch,
      resolver: publicResolver,
    });
    expect(dna.identity.description).toContain("customer feedback");
    expect(dna.opportunities.some((angle) => angle.evidence.includes("customer feedback"))).toBe(true);
  });

  it("reads bounded human copy from a same-origin JavaScript application shell", async () => {
    const page = `<html><head><title>Aegis — Solana Lending Dashboard</title><script type="module" src="/assets/app.js"></script></head><body><div id="root"></div></body></html>`;
    const script = `const copy = "One dashboard. Multiple protocols. Cross-protocol weighted health so you stop juggling tabs.";
      const feature = "AI risk summaries, liquidation warnings, and protocol events for your Solana lending positions.";
      const benefit = "Get a Telegram alert before liquidation, not after.";`;
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const path = new URL(String(input)).pathname;
      if (path === "/") return htmlResponse(page);
      if (path === "/assets/app.js") return new Response(script, { headers: { "content-type": "application/javascript" } });
      return htmlResponse("missing", { status: 404 });
    });
    const dna = await analyzeWebsite("https://aegis.example", {
      fetchImpl: fetchImpl as typeof fetch,
      resolver: publicResolver,
    });
    expect(dna.identity.description).toBe("Solana Lending Dashboard");
    expect(dna.features.some((item) => /risk summaries/i.test(item.value))).toBe(true);
    expect(dna.benefits.some((item) => /before liquidation/i.test(item.value))).toBe(true);
    expect(dna.audiences.some((item) => /lending positions/i.test(item.value))).toBe(true);
    expect(dna.opportunities.length).toBeGreaterThanOrEqual(3);
  });

  it("does not follow a redirect to a private address", async () => {
    const requestedUrls: string[] = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      requestedUrls.push(String(input));
      return new Response(null, {
      status: 302,
      headers: { location: "http://127.0.0.1/admin" },
      });
    });
    const resolver = async (hostname: string) => [{
      address: hostname === "127.0.0.1" ? "127.0.0.1" : "93.184.216.34",
      family: 4,
    }];
    const dna = await analyzeWebsite("https://example.com", {
      fetchImpl: fetchImpl as typeof fetch,
      resolver,
    });
    expect(requestedUrls.every((url) => new URL(url).hostname === "example.com")).toBe(true);
    expect(dna.analysis?.partial).toBe(true);
    expect(dna.sourcePages).toEqual(["https://example.com/"]);
  });

  it("returns an honest partial profile when the root times out", async () => {
    const dna = await analyzeWebsite("https://slow.example", {
      fetchImpl: vi.fn(async () => { throw new DOMException("Timed out", "AbortError"); }) as typeof fetch,
      resolver: publicResolver,
    });
    expect(dna.identity.domain).toBe("slow.example");
    expect(dna.analysis?.partial).toBe(true);
    expect(dna.opportunities).toHaveLength(0);
  });
});
