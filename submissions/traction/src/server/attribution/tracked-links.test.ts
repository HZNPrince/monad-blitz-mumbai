import { describe, expect, it } from "vitest";

import { createAttributionToken, createAttributionUrl, verifyAttributionToken } from "./tracked-links";

const input = {
  creativeId: "creative_1",
  ownerId: "owner_1",
  contentHash: "a".repeat(64),
  destinationUrl: "https://example.com/launch",
};

describe("signed attribution links", () => {
  it("round-trips an exact creative and destination", () => {
    const token = createAttributionToken(input, { now: 100, signingSecret: "secret" });
    expect(verifyAttributionToken(token, { now: 101, signingSecret: "secret" })).toMatchObject(input);
  });

  it("rejects tampering and expiry", () => {
    const token = createAttributionToken(input, { now: 100, ttlSeconds: 10, signingSecret: "secret" });
    expect(() => verifyAttributionToken(`${token}x`, { now: 101, signingSecret: "secret" })).toThrow(/signature/);
    expect(() => verifyAttributionToken(token, { now: 111, signingSecret: "secret" })).toThrow(/expired/);
  });

  it("uses the configured application origin", () => {
    expect(createAttributionUrl(input, {
      baseUrl: "https://traction.example",
      now: 100,
      signingSecret: "secret",
    })).toMatch(/^https:\/\/traction\.example\/r\//);
  });
});
