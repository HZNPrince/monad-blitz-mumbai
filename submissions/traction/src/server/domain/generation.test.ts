import { describe, expect, it } from "vitest";

import { assertCreativeTransition } from "./generation";
import { computeCreativeContentHash } from "@/server/services/generation-service";

describe("creative transitions", () => {
  it("allows the review and draft path", () => {
    expect(() => assertCreativeTransition("GENERATED", "APPROVED")).not.toThrow();
    expect(() => assertCreativeTransition("APPROVED", "DRAFT")).not.toThrow();
    expect(() => assertCreativeTransition("DRAFT", "DRAFT")).not.toThrow();
  });

  it("prevents terminal and skipped transitions", () => {
    expect(() => assertCreativeTransition("REJECTED", "APPROVED")).toThrow();
    expect(() => assertCreativeTransition("GENERATED", "PUBLISHED")).toThrow();
    expect(() => assertCreativeTransition("SETTLED", "DRAFT")).toThrow();
  });

  it("binds copy and editable layers into the artifact hash", () => {
    const artifact = {
      imageDataUrl: "data:image/png;base64,aW1hZ2U=",
      xCopy: "Launch",
      layers: {
        headline: "Launch",
        subhead: "A useful product",
        cta: "Try it",
        palette: ["#C7E85B", "#10110D"],
        layout: "launch" as const,
      },
    };
    expect(computeCreativeContentHash(artifact)).not.toBe(
      computeCreativeContentHash({ ...artifact, xCopy: "Changed" }),
    );
  });
});
