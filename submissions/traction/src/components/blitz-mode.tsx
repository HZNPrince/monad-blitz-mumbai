"use client";

import { ChevronLeft, ChevronRight, Edit2, X, Check, Send } from "lucide-react";
import Image from "next/image";
import { useEffect, useState } from "react";
import type { GeneratedCreative } from "@/server/domain/generation";

interface BlitzModeProps {
  creatives: GeneratedCreative[];
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onEditPrompt: (id: string) => void;
  onPublish: (id: string) => void;
  onBack: () => void;
}

export function BlitzMode({
  creatives,
  onApprove,
  onReject,
  onEditPrompt,
  onPublish,
  onBack,
}: BlitzModeProps) {
  const [index, setIndex] = useState(0);
  const [showDraft, setShowDraft] = useState(false);

  const creative = creatives[index];
  const isLast = index === creatives.length - 1;

  useEffect(() => {
    function handleKeyPress(e: KeyboardEvent) {
      if (e.key === "ArrowLeft") handleReject();
      if (e.key === "ArrowRight") handleApprove();
      if (e.key === "Escape") setShowDraft(false);
    }
    window.addEventListener("keydown", handleKeyPress);
    return () => window.removeEventListener("keydown", handleKeyPress);
  }, [index, creatives]);

  function handleApprove() {
    onApprove(creative.id);
    if (!isLast) setIndex((i) => i + 1);
  }

  function handleReject() {
    onReject(creative.id);
    if (!isLast) setIndex((i) => i + 1);
  }

  if (!creative) return null;

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-7xl px-5 py-6 sm:px-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <button
            onClick={onBack}
            className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            ← Back to DNA
          </button>
          <div className="text-sm text-muted-foreground">
            {index + 1} of {creatives.length}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1.5fr_1fr]">
          {/* Left: Stacked Cards */}
          <div className="flex items-center justify-center">
            <div className="relative w-full max-w-md h-[500px]">
              {/* Card Stack */}
              {creatives.map((c, i) => {
                const offset = i - index;
                if (offset < 0 || offset > 2) return null;

                const rotation = offset * 6;
                const yOffset = offset * 20;
                const zIndex = creatives.length - offset;
                const opacity = offset === 0 ? 1 : 0.7 - offset * 0.15;

                return (
                  <div
                    key={c.id}
                    className="absolute w-full h-full rounded-2xl border-2 border-foreground bg-card shadow-2xl overflow-hidden transition-all duration-300 flex flex-col"
                    style={{
                      transform: `translateY(${yOffset}px) rotate(${rotation}deg)`,
                      zIndex,
                      opacity,
                    }}
                  >
                    {/* Image */}
                    <div className="flex-shrink-0 h-64 w-full relative bg-muted">
                      <Image
                        src={c.imageDataUrl}
                        alt={c.angleTitle}
                        fill
                        className="object-cover"
                        unoptimized
                      />
                    </div>

                    {/* Content */}
                    <div className="flex-1 flex flex-col p-4">
                      <p className="text-xs font-medium text-muted-foreground mb-2">
                        {offset === 0 ? "LIVE PREVIEW" : "UPCOMING"}
                      </p>
                      <h3 className="font-bold text-lg leading-tight mb-2">
                        {c.angleTitle}
                      </h3>
                      <p className="text-sm text-muted-foreground flex-1">
                        {c.angleTitle.substring(0, 40)}...
                      </p>
                    </div>

                    {/* Card Footer */}
                    {offset === 0 && (
                      <div className="border-t border-border p-3 bg-muted/30 text-center">
                        <p className="text-xs font-medium cursor-pointer hover:text-primary transition-colors">
                          Edit Prompt
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right: Actions Panel */}
          <div className="flex flex-col gap-6">
            {/* Decision Buttons */}
            <div className="space-y-3">
              <div className="flex gap-3">
                <button
                  onClick={handleReject}
                  className="flex-1 flex items-center justify-center gap-2 min-h-14 rounded-xl border-2 border-destructive/40 bg-destructive/5 text-destructive font-semibold transition-all hover:border-destructive/60 hover:bg-destructive/10 active:scale-95"
                  title="Reject (← Arrow)"
                >
                  <X className="size-5" />
                  Reject
                </button>
                <button
                  onClick={handleApprove}
                  className="flex-1 flex items-center justify-center gap-2 min-h-14 rounded-xl bg-primary text-primary-foreground font-semibold transition-all hover:opacity-90 active:scale-95"
                  title="Approve (→ Arrow)"
                >
                  <Check className="size-5" />
                  Approve
                </button>
              </div>
              <p className="text-center text-xs text-muted-foreground">
                Use ← → to decide • ESC to close draft
              </p>
            </div>

            {/* Draft Section */}
            <div className="rounded-xl border border-border bg-card p-6 space-y-4">
              <h3 className="font-semibold">Draft</h3>

              {/* X Copy Editor */}
              <div>
                <label className="text-sm font-medium block mb-2">X Post</label>
                <textarea
                  defaultValue={creative.xCopy}
                  rows={6}
                  className="w-full rounded-lg border border-border bg-background p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="Your X/Twitter post copy..."
                />
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2 pt-4 border-t border-border">
                <button
                  onClick={() => setShowDraft(false)}
                  className="flex-1 min-h-10 rounded-lg border border-border hover:bg-muted transition-colors font-medium text-sm"
                >
                  Save Draft
                </button>
                <button
                  onClick={() => onPublish(creative.id)}
                  className="flex-1 flex items-center justify-center gap-2 min-h-10 rounded-lg bg-foreground text-background font-medium transition-opacity hover:opacity-90"
                >
                  <Send className="size-4" />
                  Publish
                </button>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="pt-4 border-t border-border">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium">Progress</span>
                <span className="text-xs text-muted-foreground">
                  {Math.round((index / creatives.length) * 100)}%
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-primary transition-all duration-300"
                  style={{ width: `${((index + 1) / creatives.length) * 100}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Navigation Info */}
        <div className="mt-12 text-center text-sm text-muted-foreground">
          {isLast ? (
            <p>You've reviewed all creatives! 🎉</p>
          ) : (
            <p>Keep reviewing to find the perfect angle</p>
          )}
        </div>
      </div>
    </main>
  );
}
