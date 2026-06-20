"use client";

import { Edit2, X } from "lucide-react";
import Image from "next/image";
import { useState } from "react";
import type { ProductDna } from "@/lib/product-dna";

interface BrandDnaEditorProps {
  dna: ProductDna;
  onLaunchBlitz: () => void;
  onBack: () => void;
}

export function BrandDnaEditor({ dna, onLaunchBlitz, onBack }: BrandDnaEditorProps) {
  const [editingSection, setEditingSection] = useState<string | null>(null);

  return (
    <main className="mx-auto w-full max-w-7xl px-5 py-8 sm:px-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <button
          onClick={onBack}
          className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          ← Back
        </button>
        <h1 className="text-4xl font-bold tracking-tight">Your Brand DNA</h1>
        <button
          onClick={onLaunchBlitz}
          className="min-h-11 rounded-lg bg-primary px-6 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
        >
          Launch Blitz Mode
        </button>
      </div>

      <p className="text-center text-muted-foreground mb-12">
        Click on any section to customize your brand identity
      </p>

      {/* Brand Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Logo Section */}
        <BrandCard
          title="Logo"
          icon={dna.identity.logo}
          onEdit={() => setEditingSection("logo")}
        >
          <div className="aspect-square rounded-lg border border-border bg-muted flex items-center justify-center">
            {dna.identity.logo ? (
              <Image
                src={dna.identity.logo}
                alt={dna.identity.name}
                width={120}
                height={120}
                className="max-w-[80%] max-h-[80%]"
                unoptimized
              />
            ) : (
              <div className="text-4xl font-bold text-muted-foreground">
                {dna.identity.name.charAt(0).toUpperCase()}
              </div>
            )}
          </div>
        </BrandCard>

        {/* Colors Section */}
        <BrandCard title="Colors" onEdit={() => setEditingSection("colors")}>
          <div className="grid grid-cols-2 gap-3">
            {(dna.identity.colors.length > 0
              ? dna.identity.colors
              : ["#6D7F20", "#10110D", "#F3F5EC", "#FFFFFF"]
            ).slice(0, 4).map((color, i) => (
              <div
                key={i}
                className="aspect-square rounded-lg border border-border"
                style={{ backgroundColor: color }}
                title={color}
              />
            ))}
          </div>
        </BrandCard>

        {/* Typography Section */}
        <BrandCard title="Typography" onEdit={() => setEditingSection("typography")}>
          <div className="space-y-3">
            <div>
              <p className="text-xs text-muted-foreground">Primary</p>
              <p className="text-2xl font-bold">{dna.identity.name.split(" ")[0]}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Voice</p>
              <p className="text-sm leading-relaxed">
                {dna.identity.description.slice(0, 60)}...
              </p>
            </div>
          </div>
        </BrandCard>
      </div>

      {/* Features & Benefits */}
      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <BrandCard
          title={`Features (${dna.features.length})`}
          onEdit={() => setEditingSection("features")}
        >
          <div className="space-y-2">
            {dna.features.slice(0, 3).map((f, i) => (
              <div key={i} className="text-sm text-foreground flex items-start gap-2">
                <span className="text-primary">•</span>
                <span>{f.value.slice(0, 50)}...</span>
              </div>
            ))}
          </div>
        </BrandCard>

        <BrandCard
          title={`Benefits (${dna.benefits.length})`}
          onEdit={() => setEditingSection("benefits")}
        >
          <div className="space-y-2">
            {dna.benefits.slice(0, 3).map((b, i) => (
              <div key={i} className="text-sm text-foreground flex items-start gap-2">
                <span className="text-primary">•</span>
                <span>{b.value.slice(0, 50)}...</span>
              </div>
            ))}
          </div>
        </BrandCard>
      </div>

      {/* CTAs & Audiences */}
      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <BrandCard
          title={`Calls to Action (${dna.callsToAction.length})`}
          onEdit={() => setEditingSection("ctas")}
        >
          <div className="space-y-2">
            {dna.callsToAction.slice(0, 3).map((c, i) => (
              <button
                key={i}
                className="w-full rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium transition-colors hover:bg-muted text-left"
              >
                {c.value}
              </button>
            ))}
          </div>
        </BrandCard>

        <BrandCard
          title={`Audiences (${dna.audiences.length})`}
          onEdit={() => setEditingSection("audiences")}
        >
          <div className="space-y-2">
            {dna.audiences.slice(0, 3).map((a, i) => (
              <div key={i} className="text-sm text-foreground flex items-start gap-2">
                <span className="text-primary">→</span>
                <span>{a.value.slice(0, 50)}...</span>
              </div>
            ))}
          </div>
        </BrandCard>
      </div>

      {/* Visual Assets Preview */}
      {dna.images.length > 0 && (
        <div className="mt-8">
          <h3 className="text-lg font-semibold mb-4">Visual Assets</h3>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {dna.images.slice(0, 4).map((img, i) => (
              <div
                key={i}
                className="relative aspect-video rounded-lg border border-border overflow-hidden bg-muted"
              >
                <Image
                  src={img.url}
                  alt={img.alt}
                  fill
                  className="object-cover"
                  unoptimized
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </main>
  );
}

function BrandCard({
  title,
  icon,
  children,
  onEdit,
}: {
  title: string;
  icon?: string;
  children: React.ReactNode;
  onEdit: () => void;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-6 hover:border-foreground/30 transition-colors group">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-foreground">{title}</h3>
        <button
          onClick={onEdit}
          className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-all opacity-0 group-hover:opacity-100"
          aria-label={`Edit ${title}`}
        >
          <Edit2 className="size-4" />
        </button>
      </div>
      {children}
    </div>
  );
}
