"use client";

import { useEffect, useState } from "react";
import { ExternalLink, Send } from "lucide-react";

import type { GeneratedCreative } from "@/server/domain/generation";

type XState = {
  loading: boolean;
  configured: boolean;
  connected: boolean;
  publishing: boolean;
  error: string;
  postUrl?: string;
};

export function XPublishPanel({ creative }: { creative: GeneratedCreative }) {
  const [state, setState] = useState<XState>({
    loading: true,
    configured: false,
    connected: false,
    publishing: false,
    error: "",
    postUrl: creative.publication?.url,
  });

  async function refresh() {
    try {
      const response = await fetch("/api/connectors/x/status", { cache: "no-store" });
      const payload = await response.json() as { configured?: boolean; connected?: boolean };
      setState((current) => ({ ...current, loading: false, configured: Boolean(payload.configured), connected: Boolean(payload.connected), error: "" }));
    } catch {
      setState((current) => ({ ...current, loading: false, error: "Could not read X connection status." }));
    }
  }

  useEffect(() => {
    void refresh();
    function message(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type === "traction:x-connected") void refresh();
      if (event.data?.type === "traction:x-error") {
        setState((current) => ({ ...current, error: event.data.message ?? "X authorization failed." }));
      }
    }
    window.addEventListener("message", message);
    return () => window.removeEventListener("message", message);
  }, []);

  function connect() {
    window.open("/api/connectors/x/authorize", "traction-x-oauth", "popup,width=560,height=720");
  }

  async function publish() {
    setState((current) => ({ ...current, publishing: true, error: "" }));
    try {
      const draftResponse = await fetch(`/api/creatives/${creative.id}/draft`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ xCopy: creative.xCopy, layers: creative.layers }),
      });
      const draftPayload = await draftResponse.json() as { ok: boolean; error?: string };
      if (!draftPayload.ok) throw new Error(draftPayload.error ?? "Could not save the exact artifact before publishing.");
      const response = await fetch("/api/publications/x", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ creativeId: creative.id }),
      });
      const payload = await response.json() as { ok: boolean; creative?: GeneratedCreative; error?: string };
      if (!payload.ok || !payload.creative?.publication) throw new Error(payload.error ?? "X publishing failed.");
      setState((current) => ({ ...current, publishing: false, postUrl: payload.creative!.publication!.url }));
    } catch (error) {
      setState((current) => ({ ...current, publishing: false, error: error instanceof Error ? error.message : "X publishing failed." }));
    }
  }

  if (state.loading) {
    return <div className="h-11 animate-pulse bg-muted" aria-label="Checking X connection" />;
  }

  if (state.postUrl) {
    return (
      <a href={state.postUrl} target="_blank" rel="noreferrer" className="flex min-h-11 items-center justify-center gap-2 border border-primary/40 px-4 text-sm font-semibold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        View published post <ExternalLink className="size-4" aria-hidden />
      </a>
    );
  }

  if (!state.configured) {
    return (
      <div>
        <button type="button" disabled className="flex min-h-11 w-full cursor-not-allowed items-center justify-center gap-2 bg-primary px-4 text-sm font-semibold text-primary-foreground opacity-40"><Send className="size-4" aria-hidden />Connect X / Publish</button>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">Add the X OAuth credentials and encryption key to enable publishing.</p>
      </div>
    );
  }

  const liveImage = creative.providerMode === "live" && creative.mediaType !== "image/svg+xml";
  return (
    <div>
      {!state.connected ? (
        <button type="button" onClick={connect} className="flex min-h-11 w-full items-center justify-center gap-2 border border-border bg-secondary px-4 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><Send className="size-4" aria-hidden />Connect X</button>
      ) : (
        <button type="button" onClick={() => void publish()} disabled={!liveImage || state.publishing} aria-busy={state.publishing} className="flex min-h-11 w-full items-center justify-center gap-2 bg-primary px-4 text-sm font-semibold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40"><Send className="size-4" aria-hidden />{state.publishing ? "Publishing to X" : "Publish approved creative"}</button>
      )}
      {!liveImage && state.connected ? <p className="mt-2 text-xs leading-5 text-muted-foreground">Generate a live PNG with Cloudflare before publishing. LOCAL MOCK SVGs remain drafts.</p> : null}
      {state.error ? <p role="alert" className="mt-2 text-xs text-destructive">{state.error}</p> : null}
    </div>
  );
}
