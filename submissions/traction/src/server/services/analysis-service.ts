import { randomUUID } from "node:crypto";

import { analyzeWebsite } from "@/lib/ingestion";
import type { ProductDna } from "@/lib/product-dna";
import type { GeneratedCreative, GenerationJob } from "@/server/domain/generation";
import { canonicalizeProductDna, type ProductDnaRecord } from "@/server/domain/product-dna";
import { generationService, type GenerationService } from "@/server/services/generation-service";
import { createWebScraperProvider } from "@/server/providers/web-scraper";

export type AnalysisJobStatus =
  | "QUEUED"
  | "FETCHING"
  | "ENRICHING"
  | "GENERATING"
  | "READY"
  | "PARTIAL"
  | "FAILED";

export type AnalysisJob = {
  id: string;
  ownerId: string;
  url: string;
  status: AnalysisJobStatus;
  message: string;
  progress: number;
  createdAt: string;
  updatedAt: string;
  dna?: ProductDna;
  record?: ProductDnaRecord;
  generationJob?: GenerationJob;
  creatives?: GeneratedCreative[];
  warnings: string[];
  error?: string;
};

const globalJobs = globalThis as typeof globalThis & {
  __tractionAnalysisJobs?: Map<string, AnalysisJob>;
};
const jobs = globalJobs.__tractionAnalysisJobs ?? new Map<string, AnalysisJob>();
if (process.env.NODE_ENV === "development") globalJobs.__tractionAnalysisJobs = jobs;

function timestamp() {
  return new Date().toISOString();
}

export class AnalysisService {
  constructor(
    private readonly analyze: typeof analyzeWebsite = analyzeWebsite,
    private readonly generations: GenerationService = generationService,
  ) {}

  create(url: string, ownerId: string) {
    const normalized = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).toString();
    const createdAt = timestamp();
    const job: AnalysisJob = {
      id: `analysis_${randomUUID()}`,
      ownerId,
      url: normalized,
      status: "QUEUED",
      message: "Preparing a safe site scan",
      progress: 5,
      createdAt,
      updatedAt: createdAt,
      warnings: [],
    };
    jobs.set(job.id, job);
    return structuredClone(job);
  }

  get(id: string, ownerId: string) {
    const job = jobs.get(id);
    return job?.ownerId === ownerId ? structuredClone(job) : undefined;
  }

  async run(id: string) {
    const queued = jobs.get(id);
    if (!queued) return;
    this.update(id, {
      status: "FETCHING",
      message: "Reading the site and its strongest product pages",
      progress: 20,
    });
    try {
      const dna = await this.analyze(queued.url);
      const record = canonicalizeProductDna(dna, queued.ownerId);
      this.update(id, {
        status: "ENRICHING",
        message: "Turning the evidence into your brand profile",
        progress: 62,
        dna,
        record,
        warnings: dna.analysis?.warnings ?? [],
      });
      this.update(id, {
        status: "GENERATING",
        message: "Building your first campaign stack",
        progress: 78,
      });
      const result = await this.generations.createJob({
        ownerId: queued.ownerId,
        productDna: record,
        count: 4,
      });
      const partial = Boolean(dna.analysis?.partial)
        || result.job.status === "PARTIALLY_SUCCEEDED";
      this.update(id, {
        status: partial ? "PARTIAL" : "READY",
        message: partial
          ? "Your preview is ready from the evidence we could verify"
          : "Your campaign stack is ready",
        progress: 100,
        generationJob: result.job,
        creatives: result.creatives,
        warnings: [
          ...(dna.analysis?.warnings ?? []),
          ...(result.job.error ? [result.job.error] : []),
        ],
      });
    } catch (error) {
      this.update(id, {
        status: "FAILED",
        message: "We could not finish this scan",
        progress: 100,
        error: error instanceof Error ? error.message : "Analysis failed.",
      });
    }
  }

  private update(id: string, patch: Partial<AnalysisJob>) {
    const current = jobs.get(id);
    if (!current) return;
    jobs.set(id, { ...current, ...patch, updatedAt: timestamp() });
  }
}

export const analysisService = new AnalysisService();
