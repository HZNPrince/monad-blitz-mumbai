/**
 * Web scraping provider with Firecrawl integration
 * Falls back to built-in ingestion if Firecrawl unavailable
 */

export interface ScrapedContent {
  url: string;
  title: string;
  description: string;
  html: string;
  text: string;
  markdown: string;
  images: Array<{ url: string; alt: string }>;
  links: Array<{ url: string; text: string }>;
  metadata: Record<string, unknown>;
}

interface FirecrawlOptions {
  mode?: "crawl" | "scrape";
  onlyMainContent?: boolean;
  includeTags?: string[];
  excludeTags?: string[];
  timeout?: number;
  maxRetries?: number;
}

/**
 * Firecrawl API wrapper for intelligent web scraping
 */
export class FirecrawlProvider {
  private apiKey: string;
  private baseUrl = "https://api.firecrawl.dev/v1";

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.FIRECRAWL_API_KEY || "";
  }

  isAvailable(): boolean {
    return Boolean(this.apiKey);
  }

  async scrapeUrl(url: string, options: FirecrawlOptions = {}): Promise<ScrapedContent> {
    if (!this.isAvailable()) {
      throw new Error("Firecrawl API key not configured");
    }

    try {
      const response = await fetch(`${this.baseUrl}/scrape`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url,
          formats: ["markdown", "html"],
          onlyMainContent: options.onlyMainContent ?? true,
          timeout: options.timeout ?? 30000,
          includeTags: options.includeTags,
          excludeTags: options.excludeTags,
          waitForSelector: "body",
        }),
        signal: AbortSignal.timeout(45000),
      });

      if (!response.ok) {
        throw new Error(`Firecrawl error: ${response.status}`);
      }

      const data = await response.json() as {
        success: boolean;
        data?: {
          url: string;
          title: string;
          description: string;
          html: string;
          markdown: string;
          links: Array<{ url: string; text: string }>;
          screenshot: string;
          metadata: Record<string, unknown>;
        };
      };

      if (!data.success || !data.data) {
        throw new Error("Firecrawl scrape failed");
      }

      return {
        url: data.data.url,
        title: data.data.title || "",
        description: data.data.description || "",
        html: data.data.html || "",
        text: this.extractText(data.data.markdown),
        markdown: data.data.markdown || "",
        images: this.extractImages(data.data.markdown),
        links: data.data.links || [],
        metadata: data.data.metadata,
      };
    } catch (error) {
      throw new Error(
        `Firecrawl scraping failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  async crawlWebsite(
    url: string,
    maxPages: number = 4,
    options: FirecrawlOptions = {},
  ): Promise<ScrapedContent[]> {
    if (!this.isAvailable()) {
      throw new Error("Firecrawl API key not configured");
    }

    try {
      const response = await fetch(`${this.baseUrl}/crawl`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url,
          limit: maxPages,
          scrapeOptions: {
            formats: ["markdown", "html"],
            onlyMainContent: options.onlyMainContent ?? true,
          },
          timeout: options.timeout ?? 30000,
        }),
        signal: AbortSignal.timeout(60000),
      });

      if (!response.ok) {
        throw new Error(`Firecrawl error: ${response.status}`);
      }

      const data = await response.json() as {
        success: boolean;
        data?: Array<{
          url: string;
          title: string;
          description: string;
          html: string;
          markdown: string;
          links: Array<{ url: string; text: string }>;
          metadata: Record<string, unknown>;
        }>;
      };

      if (!data.success || !data.data) {
        throw new Error("Firecrawl crawl failed");
      }

      return data.data.map((page) => ({
        url: page.url,
        title: page.title || "",
        description: page.description || "",
        html: page.html || "",
        text: this.extractText(page.markdown),
        markdown: page.markdown || "",
        images: this.extractImages(page.markdown),
        links: page.links || [],
        metadata: page.metadata,
      }));
    } catch (error) {
      throw new Error(
        `Firecrawl crawling failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  private extractText(markdown: string): string {
    return markdown
      .replace(/[#*`\[\]()]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 100000);
  }

  private extractImages(markdown: string): Array<{ url: string; alt: string }> {
    const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
    const images: Array<{ url: string; alt: string }> = [];
    let match;

    while ((match = imageRegex.exec(markdown))) {
      images.push({
        alt: match[1] || "Image",
        url: match[2],
      });
    }

    return images.slice(0, 10);
  }
}

/**
 * Initialize Firecrawl provider (will use Firecrawl if API key available, graceful fallback otherwise)
 */
export function createWebScraperProvider(): FirecrawlProvider {
  return new FirecrawlProvider(process.env.FIRECRAWL_API_KEY);
}

/**
 * Format scraped content for product DNA analysis
 */
export function formatScrapedContentForAnalysis(contents: ScrapedContent[]): string {
  return contents
    .map((content) => {
      return `[${new URL(content.url).pathname || "Homepage"}]\nTitle: ${content.title}\nDescription: ${content.description}\n${content.text.slice(0, 2000)}`;
    })
    .join("\n\n");
}
