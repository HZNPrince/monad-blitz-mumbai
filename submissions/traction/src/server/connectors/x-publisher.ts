import { z } from "zod";

export const xPublishInputSchema = z.object({
  creativeId: z.string().min(1),
});

async function xRequest(url: string, accessToken: string, init: RequestInit) {
  const response = await fetch(url, {
    ...init,
    headers: { authorization: `Bearer ${accessToken}`, ...init.headers },
    cache: "no-store",
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`X API returned ${response.status}: ${body.slice(0, 300)}`);
  }
  return response;
}

async function uploadImage(accessToken: string, dataUrl: string) {
  const match = dataUrl.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!match) throw new Error("X publishing supports generated PNG, JPEG, or WebP images. Local SVG mocks cannot be published.");
  const bytes = Buffer.from(match[2], "base64");
  if (bytes.length > 5 * 1024 * 1024) throw new Error("The generated image exceeds the 5 MB X upload limit.");

  const initForm = new FormData();
  initForm.set("command", "INIT");
  initForm.set("media_type", match[1]);
  initForm.set("total_bytes", String(bytes.length));
  initForm.set("media_category", "tweet_image");
  const initialized = await xRequest("https://api.x.com/2/media/upload", accessToken, { method: "POST", body: initForm });
  const initPayload = await initialized.json() as { data?: { id?: string } };
  const mediaId = initPayload.data?.id;
  if (!mediaId) throw new Error("X did not return a media ID.");

  const appendForm = new FormData();
  appendForm.set("command", "APPEND");
  appendForm.set("media_id", mediaId);
  appendForm.set("segment_index", "0");
  appendForm.set("media", new Blob([bytes], { type: match[1] }), "traction-campaign.png");
  await xRequest("https://api.x.com/2/media/upload", accessToken, { method: "POST", body: appendForm });

  const finalizeForm = new FormData();
  finalizeForm.set("command", "FINALIZE");
  finalizeForm.set("media_id", mediaId);
  await xRequest("https://api.x.com/2/media/upload", accessToken, { method: "POST", body: finalizeForm });
  return mediaId;
}

export async function publishToX(input: { text: string; imageDataUrl?: string }, accessToken: string) {
  const mediaId = input.imageDataUrl ? await uploadImage(accessToken, input.imageDataUrl) : undefined;
  const response = await xRequest("https://api.x.com/2/tweets", accessToken, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      text: input.text,
      ...(mediaId ? { media: { media_ids: [mediaId] } } : {}),
    }),
  });
  const payload = await response.json() as { data?: { id?: string; text?: string } };
  if (!payload.data?.id) throw new Error("X did not return a post ID.");
  return { id: payload.data.id, text: payload.data.text ?? input.text };
}
