"use client";

import Image from "next/image";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronRight,
  ExternalLink,
  Globe2,
  Layers3,
  Save,
  UserRound,
  X,
} from "lucide-react";

import { WalletPanel } from "@/components/wallet-panel";
import { XPublishPanel } from "@/components/x-publish-panel";
import { BrandDnaEditor } from "@/components/brand-dna-editor";
import { BlitzMode } from "@/components/blitz-mode";
import type { ProductDna } from "@/lib/product-dna";
import type { ActivityEvent, GeneratedCreative } from "@/server/domain/generation";
import type { AnalysisJob } from "@/server/services/analysis-service";

type View = "home" | "analyzing" | "brand-dna" | "blitz" | "editor" | "activity";

function host(value: string) {
  try {
    return new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`).hostname.replace(/^www\./, "");
  } catch {
    return value;
  }
}

function Header({ onHome, onActivity }: { onHome: () => void; onActivity: () => void }) {
  return (
    <header className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-5 sm:px-8">
      <button type="button" onClick={onHome} className="flex min-h-10 items-center gap-2.5 rounded-md px-1 text-sm font-semibold tracking-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <span className="grid size-8 place-items-center rounded-md bg-foreground text-background"><Layers3 className="size-4" aria-hidden /></span>
        Traction
      </button>
      <nav className="flex items-center gap-1" aria-label="Primary navigation">
        <button type="button" onClick={onActivity} className="flex min-h-10 items-center gap-2 rounded-md px-3 text-sm text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <Activity className="size-4" aria-hidden />
          <span className="hidden sm:inline">Activity</span>
        </button>
        <span className="grid size-10 place-items-center rounded-full bg-muted text-muted-foreground" aria-label="Profile"><UserRound className="size-4" aria-hidden /></span>
      </nav>
    </header>
  );
}

function Home({ initialUrl, error, onStart }: { initialUrl: string; error: string; onStart: (url: string) => void }) {
  const [url, setUrl] = useState(initialUrl);
  function submit(event: FormEvent) {
    event.preventDefault();
    if (url.trim()) onStart(url.trim());
  }
  return (
    <main className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-5xl flex-col items-center px-5 pb-16 pt-[12vh] sm:px-8">
      <div className="w-full max-w-2xl text-center">
        <p className="mb-4 text-sm font-medium text-muted-foreground">Your distribution agent</p>
        <h1 className="text-balance text-4xl font-semibold tracking-[-0.035em] sm:text-6xl">What are you launching?</h1>
        <form onSubmit={submit} className="mt-10">
          <label htmlFor="website" className="sr-only">Product website</label>
          <div className="flex min-h-16 items-center rounded-lg border border-border bg-card p-2 pl-5 shadow-[0_12px_40px_rgba(20,24,18,0.08)] focus-within:border-foreground/30 focus-within:ring-2 focus-within:ring-ring/20">
            <Globe2 className="mr-3 size-5 shrink-0 text-muted-foreground" aria-hidden />
            <input id="website" type="url" inputMode="url" autoComplete="url" autoFocus value={url} onChange={(event) => setUrl(event.target.value)} placeholder="Paste your product URL" className="h-12 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground/70" aria-invalid={Boolean(error)} />
            <button type="submit" disabled={!url.trim()} aria-label="Analyze website" className="grid size-12 shrink-0 place-items-center rounded-md bg-foreground text-background transition-transform duration-150 hover:translate-x-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-30">
              <ArrowRight className="size-5" aria-hidden />
            </button>
          </div>
          {error ? <p role="alert" className="mt-3 text-left text-sm text-destructive">{error}</p> : null}
        </form>
      </div>
      <section className="mt-24 w-full max-w-3xl border-t border-border pt-6" aria-label="Recent projects">
        <div className="flex items-center justify-between"><h2 className="text-sm font-medium">Recent projects</h2><span className="text-xs text-muted-foreground">Your analyzed launches appear here</span></div>
        <div className="mt-4 flex min-h-28 items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">No recent projects yet</div>
      </section>
    </main>
  );
}

function Analysis({ job, onCancel }: { job: AnalysisJob; onCancel: () => void }) {
  const brand = job.dna?.identity.name || host(job.url).split(".")[0];
  const hero = job.dna?.images[0];
  return (
    <main className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-4xl items-start justify-center px-5 pb-16 pt-[7vh] sm:px-8">
      <section className="w-full overflow-hidden rounded-lg border border-border bg-card shadow-[0_18px_60px_rgba(20,24,18,0.07)]">
        <div className="p-6 sm:p-10">
          <div className="flex items-start justify-between gap-6">
            <div><p className="text-sm text-muted-foreground">{host(job.url)}</p><h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Learning {brand}</h1></div>
            <span className="shrink-0 text-sm tabular-nums text-muted-foreground">{job.progress}%</span>
          </div>
          <p className="mt-8 text-base font-medium" aria-live="polite">{job.message}</p>
          <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-[width] duration-150" style={{ width: `${job.progress}%` }} /></div>
        </div>
        <div className="relative aspect-[16/7] border-t border-border bg-muted">
          {hero ? <Image src={hero.url} alt={hero.alt || `Discovered visual for ${brand}`} fill unoptimized className="object-cover" /> : <div className="absolute inset-0 grid place-items-center"><div className="w-4/5 space-y-3"><div className="h-5 w-2/5 animate-pulse rounded bg-border" /><div className="h-12 w-3/4 animate-pulse rounded bg-border/80" /><div className="h-4 w-1/2 animate-pulse rounded bg-border/60" /></div></div>}
        </div>
        <div className="flex items-center justify-between border-t border-border px-6 py-4 sm:px-10">
          <details className="text-sm text-muted-foreground"><summary className="cursor-pointer select-none rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Details</summary><div className="mt-3 max-w-xl space-y-1 text-xs leading-5"><p>Status: {job.status.toLowerCase()}</p>{job.warnings.map((warning) => <p key={warning}>{warning}</p>)}</div></details>
          <button type="button" onClick={onCancel} className="min-h-10 rounded-md px-3 text-sm text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Cancel</button>
        </div>
      </section>
    </main>
  );
}

function ActivityView({ events, onHome }: { events: ActivityEvent[]; onHome: () => void }) {
  return <main className="mx-auto w-full max-w-3xl px-5 pb-16 pt-10 sm:px-8"><h1 className="text-4xl font-semibold tracking-tight">Activity</h1>{events.length ? <ol className="mt-8 divide-y divide-border border-y border-border">{events.map((event) => <li key={event.id} className="flex gap-4 py-5"><span className="mt-1 size-2 shrink-0 rounded-full bg-primary" /><div className="min-w-0 flex-1"><p className="text-sm font-medium">{event.detail}</p><p className="mt-1 text-xs capitalize text-muted-foreground">{event.type.toLowerCase().replaceAll("_", " ")} · {new Date(event.createdAt).toLocaleString()}</p></div><ChevronRight className="size-4 text-muted-foreground" aria-hidden /></li>)}</ol> : <div className="mt-8 rounded-lg border border-dashed border-border py-16 text-center"><Activity className="mx-auto size-6 text-muted-foreground" aria-hidden /><p className="mt-4 text-sm text-muted-foreground">Your campaign decisions will appear here.</p><button type="button" onClick={onHome} className="mt-5 min-h-11 rounded-md bg-foreground px-5 text-sm font-semibold text-background">Analyze a product</button></div>}</main>;
}

export function TractionWorkspace() {
  const [view, setView] = useState<View>("home");
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [job, setJob] = useState<AnalysisJob | null>(null);
  const [creatives, setCreatives] = useState<GeneratedCreative[]>([]);
  const [index, setIndex] = useState(0);
  const [editing, setEditing] = useState<GeneratedCreative | null>(null);
  const [events, setEvents] = useState<ActivityEvent[]>([]);

  async function start(input: string) {
    setError(""); setUrl(input); setJob(null); setCreatives([]); setIndex(0); setView("analyzing");
    try {
      const response = await fetch("/api/analysis/jobs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: input }) });
      const payload = await response.json() as { ok: boolean; job?: AnalysisJob; error?: string };
      if (!payload.ok || !payload.job) throw new Error(payload.error || "Could not start analysis.");
      setJob(payload.job);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not start analysis."); setView("home"); }
  }

  useEffect(() => {
    if (view !== "analyzing" || !job || ["READY", "PARTIAL", "FAILED"].includes(job.status)) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/analysis/jobs/${job.id}`, { cache: "no-store" });
        const payload = await response.json() as { ok: boolean; job?: AnalysisJob; error?: string };
        if (cancelled || !payload.ok || !payload.job) return;
        setJob(payload.job);
        if (["READY", "PARTIAL"].includes(payload.job.status) && payload.job.creatives?.length) { setCreatives(payload.job.creatives); setView("brand-dna"); }
        if (payload.job.status === "FAILED") { setError(payload.job.error || "This site could not be analyzed."); setView("home"); }
      } catch { if (!cancelled) setError("Connection interrupted. Retrying…"); }
    }, 650);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [job, view]);

  const current = creatives[index];
  const activeView = useMemo(() => view, [view]);

  const decide = useCallback(async (action: "approve" | "reject") => {
    if (!current) return;
    const response = await fetch(`/api/creatives/${current.id}/${action}`, { method: "POST", headers: { "content-type": "application/json" }, body: action === "reject" ? JSON.stringify({}) : undefined });
    const payload = await response.json() as { ok: boolean; creative?: GeneratedCreative; error?: string };
    if (!payload.ok || !payload.creative) { setError(payload.error || `Could not ${action} creative.`); return; }
    setCreatives((items) => items.map((item) => item.id === payload.creative!.id ? payload.creative! : item));
    if (action === "approve") { setEditing({ ...payload.creative, xCopy: current.xCopy }); setView("editor"); }
    else if (index < creatives.length - 1) setIndex((value) => value + 1); else void openActivity();
  }, [current, index, creatives.length])

  useEffect(() => {
    if (activeView !== "blitz") return;
    function key(event: KeyboardEvent) { if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return; if (event.key === "ArrowLeft") void decide("reject"); if (event.key === "ArrowRight") void decide("approve"); }
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [activeView, index, creatives, decide]);

  async function openActivity() { const response = await fetch("/api/activity", { cache: "no-store" }); const payload = await response.json() as { activity?: ActivityEvent[] }; setEvents(payload.activity ?? []); setView("activity"); }
  function updateCurrentCopy(value: string) { setCreatives((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, xCopy: value } : item)); }
  function updateEditing(next: GeneratedCreative) { setEditing(next); setCreatives((items) => items.map((item) => item.id === next.id ? next : item)); }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header onHome={() => setView("home")} onActivity={() => void openActivity()} />
      {view === "home" ? <Home initialUrl={url} error={error} onStart={(value) => void start(value)} /> : null}
      {view === "analyzing" && job ? <Analysis job={job} onCancel={() => setView("home")} /> : null}
      {view === "brand-dna" && job?.dna ? <BrandDnaEditor dna={job.dna} onLaunchBlitz={() => setView("blitz")} onBack={() => setView("home")} /> : null}
      {view === "blitz" ? (
        <BlitzMode
          creatives={creatives}
          onApprove={() => void decide("approve")}
          onReject={() => void decide("reject")}
          onEditPrompt={() => {}}
          onPublish={() => {}}
          onBack={() => setView("brand-dna")}
        />
      ) : null}
      {view === "activity" ? <ActivityView events={events} onHome={() => setView("home")} /> : null}
    </div>
  );
}
