import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import type { GenerationJob } from "@/server/domain/generation";
import { GenerationStore, JsonFileGenerationPersistence } from "./generation-store";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

const job: GenerationJob = {
  id: "job_1",
  ownerId: "owner_1",
  productDnaId: "dna_1",
  productDnaRevision: 1,
  status: "SUCCEEDED",
  requestedCount: 3,
  provider: "local",
  providerMode: "local",
  model: "deterministic",
  prompts: ["one"],
  sourceAssets: [],
  creativeIds: [],
  createdAt: "2026-06-20T00:00:00.000Z",
  completedAt: "2026-06-20T00:01:00.000Z",
};

describe("generation persistence", () => {
  it("atomically restores owner-scoped state from a JSON snapshot", () => {
    const directory = mkdtempSync(join(tmpdir(), "traction-store-"));
    temporaryDirectories.push(directory);
    const persistence = new JsonFileGenerationPersistence(join(directory, "store.json"));
    new GenerationStore(persistence).saveJob(job);

    const restored = new GenerationStore(persistence);
    expect(restored.getJob(job.id, job.ownerId)).toEqual(job);
    expect(restored.getJob(job.id, "another-owner")).toBeUndefined();
  });
});
