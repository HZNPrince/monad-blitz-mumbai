import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";

import {
  activityEventSchema,
  generatedCreativeSchema,
  generationJobSchema,
  type ActivityEvent,
  type GeneratedCreative,
  type GenerationJob,
} from "@/server/domain/generation";

const snapshotSchema = z.object({
  version: z.literal(1),
  jobs: z.array(generationJobSchema),
  creatives: z.array(generatedCreativeSchema),
  activity: z.array(activityEventSchema),
});

type GenerationSnapshot = z.infer<typeof snapshotSchema>;

export interface GenerationPersistence {
  load(): GenerationSnapshot | undefined;
  save(snapshot: GenerationSnapshot): void;
}

export class JsonFileGenerationPersistence implements GenerationPersistence {
  readonly path: string;

  constructor(path: string) {
    this.path = resolve(path);
  }

  load() {
    try {
      return snapshotSchema.parse(JSON.parse(readFileSync(this.path, "utf8")));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw new Error(`Traction store at ${this.path} is unreadable or invalid.`, { cause: error });
    }
  }

  save(snapshot: GenerationSnapshot) {
    mkdirSync(dirname(this.path), { recursive: true, mode: 0o700 });
    const temporaryPath = `${this.path}.${process.pid}.${randomUUID()}.tmp`;
    writeFileSync(temporaryPath, JSON.stringify(snapshot), { encoding: "utf8", mode: 0o600 });
    renameSync(temporaryPath, this.path);
  }
}

type StoreData = {
  jobs: Map<string, GenerationJob>;
  creatives: Map<string, GeneratedCreative>;
  activity: ActivityEvent[];
};

export class GenerationStore {
  private readonly data: StoreData;

  constructor(private readonly persistence?: GenerationPersistence) {
    const snapshot = persistence?.load();
    this.data = {
      jobs: new Map((snapshot?.jobs ?? []).map((job) => [job.id, job])),
      creatives: new Map((snapshot?.creatives ?? []).map((creative) => [creative.id, creative])),
      activity: snapshot?.activity ?? [],
    };
  }

  saveJob(job: GenerationJob) {
    this.data.jobs.set(job.id, structuredClone(job));
    this.persist();
    return job;
  }

  getJob(id: string, ownerId: string) {
    const job = this.data.jobs.get(id);
    if (!job || job.ownerId !== ownerId) return undefined;
    return structuredClone(job);
  }

  saveCreative(creative: GeneratedCreative) {
    this.data.creatives.set(creative.id, structuredClone(creative));
    this.persist();
    return creative;
  }

  getCreative(id: string, ownerId: string) {
    const creative = this.data.creatives.get(id);
    if (!creative || creative.ownerId !== ownerId) return undefined;
    return structuredClone(creative);
  }

  getCreatives(ids: string[], ownerId: string) {
    return ids.flatMap((id) => {
      const creative = this.getCreative(id, ownerId);
      return creative ? [creative] : [];
    });
  }

  addActivity(event: ActivityEvent) {
    this.data.activity.unshift(structuredClone(event));
    this.data.activity = this.data.activity.slice(0, 250);
    this.persist();
    return event;
  }

  getActivity(ownerId: string) {
    return this.data.activity
      .filter((event) => event.ownerId === ownerId)
      .map((event) => structuredClone(event));
  }

  private persist() {
    this.persistence?.save({
      version: 1,
      jobs: [...this.data.jobs.values()],
      creatives: [...this.data.creatives.values()],
      activity: this.data.activity,
    });
  }
}

function defaultPersistence() {
  const configured = process.env.TRACTION_STORE_PATH?.trim();
  if (configured) return new JsonFileGenerationPersistence(configured);
  if (process.env.NODE_ENV === "development") {
    return new JsonFileGenerationPersistence(join(process.cwd(), ".data", "traction-store.json"));
  }
  return undefined;
}

const globalStore = globalThis as typeof globalThis & {
  __tractionGenerationStore?: GenerationStore;
};

export const generationStore = globalStore.__tractionGenerationStore
  ?? new GenerationStore(defaultPersistence());

if (process.env.NODE_ENV === "development") {
  globalStore.__tractionGenerationStore = generationStore;
}
