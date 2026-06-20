import { describe, expect, it } from "vitest";

import {
  assertPublicWebsiteUrl,
  isBlockedAddress,
  normalizeWebsiteUrl,
} from "./url-safety";

describe("URL safety", () => {
  it.each([
    "127.0.0.1",
    "10.0.0.1",
    "169.254.1.1",
    "172.16.0.1",
    "192.168.1.1",
    "::1",
    "fd00::1",
    "2001:db8::1",
  ])("blocks reserved address %s", (address) => {
    expect(isBlockedAddress(address)).toBe(true);
  });

  it("normalizes a bare domain", () => {
    expect(normalizeWebsiteUrl("example.com#pricing").href).toBe(
      "https://example.com/",
    );
  });

  it("rejects private DNS results", async () => {
    await expect(
      assertPublicWebsiteUrl(new URL("https://example.com"), async () => [
        { address: "10.0.0.8", family: 4 },
      ]),
    ).rejects.toThrow(/private or reserved/);
  });

  it("allows a public web host", async () => {
    await expect(
      assertPublicWebsiteUrl(new URL("https://example.com"), async () => [
        { address: "93.184.216.34", family: 4 },
      ]),
    ).resolves.toBeUndefined();
  });

  it.each(["file:///etc/passwd", "ftp://example.com", "http://localhost"])(
    "rejects unsafe input %s",
    async (value) => {
      await expect(
        assertPublicWebsiteUrl(new URL(value), async () => []),
      ).rejects.toThrow();
    },
  );
});
