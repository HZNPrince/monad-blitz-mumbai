import { afterEach, describe, expect, it, vi } from "vitest";

import { publishToX } from "./x-publisher";

afterEach(() => vi.unstubAllGlobals());

describe("X publisher", () => {
  it("uploads an image before creating the post", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { id: "media-1" } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { id: "media-1" } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { id: "post-1", text: "Launch" } }), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await publishToX({
      text: "Launch",
      imageDataUrl: `data:image/png;base64,${Buffer.from("png").toString("base64")}`,
    }, "token");

    expect(result.id).toBe("post-1");
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls[3][0]).toBe("https://api.x.com/2/tweets");
  });

  it("refuses local SVG mock media", async () => {
    await expect(publishToX({
      text: "Launch",
      imageDataUrl: "data:image/svg+xml;base64,PHN2Zz4=",
    }, "token")).rejects.toThrow(/PNG, JPEG, or WebP/);
  });
});
