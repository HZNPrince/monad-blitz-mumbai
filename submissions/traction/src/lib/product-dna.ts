export type Product = {
  name: string;
  description?: string;
  price?: string;
  image?: string;
};

export type EvidenceItem = {
  value: string;
  source: string;
};

export type ProductDna = {
  identity: {
    name: string;
    description: string;
    domain: string;
    colors: string[];
    logo?: string;
  };
  products: Product[];
  features: EvidenceItem[];
  benefits: EvidenceItem[];
  audiences: EvidenceItem[];
  pricing: EvidenceItem[];
  painPoints: EvidenceItem[];
  differentiators: EvidenceItem[];
  images: { url: string; alt: string }[];
  testimonials: EvidenceItem[];
  offers: EvidenceItem[];
  claims: { value: string; support: "supported" | "review"; source: string }[];
  existingContent: EvidenceItem[];
  callsToAction: EvidenceItem[];
  opportunities: {
    id: string;
    title: string;
    description: string;
    format: string;
    evidence: string;
  }[];
  sourcePages: string[];
  extractedAt: string;
  analysis?: {
    partial: boolean;
    warnings: string[];
    pagesAttempted: number;
    pagesRead: number;
  };
};

export type AnalysisResponse =
  | {
      ok: true;
      dna: ProductDna;
      record: import("@/server/domain/product-dna").ProductDnaRecord;
    }
  | { ok: false; error: string };
