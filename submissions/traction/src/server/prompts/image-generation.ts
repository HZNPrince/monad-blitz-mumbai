/**
 * Professional 2026 trending image generation prompts
 * Optimized for Flux-1, emphasizing minimalism, motion graphics, and premium aesthetics
 */

export interface PromptContext {
  brandName: string;
  angle: string;
  evidence: string;
  colors: string[];
  domain: string;
}

export function generatePremiumPrompt(context: PromptContext): string {
  const {
    brandName,
    angle,
    evidence,
    colors,
  } = context;

  const primaryColor = colors[0] ?? "#6D7F20";
  const textColor = colors[1] ?? "#10110D";

  const styleElements = [
    "hyper-modern 2026 design",
    "clean minimalist aesthetic",
    "premium geometric composition",
    "soft gradient transitions",
    "professional sans-serif typography",
    "subtle motion blur elements",
    "sophisticated depth layering",
    "executive brand positioning",
  ];

  const techniques = [
    "asymmetric balanced layout",
    "floating typography",
    "cinematic color grading",
    "refined marble textures",
    "premium glass morphism",
    "subtle light ray effects",
    "meticulously spaced elements",
    "intentional negative space",
  ];

  const colorDescription = `using color palette: primary accent ${primaryColor}, deep text ${textColor}, off-white accents #F5F5F1`;

  const promptVariants: Record<string, string> = {
    "customer-outcome": `
      Professional SaaS marketing banner for ${brandName}.
      Concept: Abstract performance visualization showing "${angle}".
      Design: ${styleElements.join(", ")}.
      Composition: ${techniques.slice(0, 3).join(", ")}.
      Typography: Bold headline "${angle}" in 90pt, evidence "${evidence.slice(0, 50)}" in 28pt.
      ${colorDescription}.
      Mood: Aspirational, trustworthy, innovation-forward.
      Render: 16:9 aspect ratio, 1200x675px, 8K quality.
      Details: No people, no logos, pure brand essence.
    `,

    "product-mechanism": `
      Enterprise product explainer visual for ${brandName}.
      Focus: How ${angle} works - mechanical clarity.
      Design: 3D isometric elements merged with 2D flat design, ${styleElements.slice(0, 4).join(", ")}.
      Layout: Left-aligned title, centered mechanical diagram, right-side benefit statement.
      Typography: "${angle}" headline, "${evidence.slice(0, 60)}" description.
      ${colorDescription}.
      Technical elements: Clean lines, dimensional depth, light transparency effects.
      Style: B2B professional, cutting-edge but approachable.
      Resolution: 1200x675px, premium render.
    `,

    "audience-callout": `
      Demographic targeting visual for ${brandName} aimed at "${angle}".
      Theme: Lifestyle integration showing why "${evidence.slice(0, 50)}" matters.
      Design: ${styleElements.join(", ")}.
      Visual direction: ${techniques.slice(2, 5).join(", ")}.
      Composition: Split screen or gradient blend showing before/after transformation.
      Text: Large headline "${angle}", supporting copy with key benefit.
      ${colorDescription}.
      Atmosphere: Aspirational, relatable, premium lifestyle.
      No photography - pure design and motion graphics feel.
    `,

    "pricing-proof": `
      Value proposition visual for ${brandName}.
      Message: "${angle}" with evidence "${evidence.slice(0, 50)}".
      Design: Modern data visualization, ${styleElements.slice(0, 5).join(", ")}.
      Layout: Central pricing value, supporting metrics, call-to-action integration.
      Typography: Bold price/value indicator, clean supporting text.
      ${colorDescription}.
      Visual elements: Ascending lines, growth indicators, premium pricing card design.
      Mood: Confident, transparent, value-driven.
      Style: Financial services premium aesthetic.
    `,

    "positioning-card": `
      Brand positioning statement for ${brandName}.
      Core message: "${angle}" with foundation "${evidence.slice(0, 50)}".
      Design: ${styleElements.join(", ")}.
      Composition: ${techniques.slice(0, 4).join(", ")}.
      Typography: Elegant headline "${angle.substring(0, 30)}", sophisticated descriptor.
      ${colorDescription}.
      Layout: Centered, breathing room, premium card mounting.
      Details: Subtle brand signature element, refined borders.
      Feel: Luxury brand positioning, timeless premium aesthetic.
    `,

    "action-card": `
      Call-to-action visual for ${brandName}.
      Primary action: "${angle}".
      Supporting evidence: "${evidence.slice(0, 60)}".
      Design: Bold and modern, ${styleElements.slice(0, 4).join(", ")}.
      Composition: Action-forward layout with clear visual hierarchy, ${techniques.slice(1, 4).join(", ")}.
      Typography: Commanding headline, energetic supporting text, prominent CTA element.
      ${colorDescription}.
      Style: High conversion design, premium direct response.
      Atmosphere: Urgency balanced with sophistication.
    `,
  };

  // Find the best matching variant or use a generic premium prompt
  let selectedPrompt = promptVariants["positioning-card"];

  if (angle.toLowerCase().includes("outcome") || angle.toLowerCase().includes("benefit")) {
    selectedPrompt = promptVariants["customer-outcome"];
  } else if (angle.toLowerCase().includes("work") || angle.toLowerCase().includes("mechanism")) {
    selectedPrompt = promptVariants["product-mechanism"];
  } else if (angle.toLowerCase().includes("audience") || angle.toLowerCase().includes("for")) {
    selectedPrompt = promptVariants["audience-callout"];
  } else if (angle.toLowerCase().includes("pric") || angle.toLowerCase().includes("offer")) {
    selectedPrompt = promptVariants["pricing-proof"];
  } else if (angle.toLowerCase().includes("action") || angle.toLowerCase().includes("start")) {
    selectedPrompt = promptVariants["action-card"];
  }

  return selectedPrompt
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line)
    .join(" ");
}

/**
 * Generate alternate premium prompt for variations
 */
export function generateAlternatePrompt(context: PromptContext, variation: number): string {
  const { brandName, angle, evidence, colors } = context;
  const primaryColor = colors[0] ?? "#6D7F20";

  const alternateStyles = [
    "Brutalist typography with geometric clarity",
    "Art deco influences meeting modernism",
    "Maximalist color field with precise text",
    "Swiss grid system with organic flowing elements",
    "Constructivist design language, contemporary execution",
  ];

  const style = alternateStyles[variation % alternateStyles.length];

  return `
    Alternative premium visual for ${brandName}: ${angle}.
    Evidence-based design: "${evidence.slice(0, 60)}".
    Artistic direction: ${style}.
    Primary color accent: ${primaryColor}.
    Requirements: 2026 trendy, professional, startup-grade.
    Mood: Innovative yet grounded, creative yet clear.
    Format: 1200x675px, premium render quality.
    Aesthetic: High-end design magazine spread quality.
  `
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line)
    .join(" ");
}

/**
 * Motion graphics enhancement for image prompts
 */
export function enhanceWithMotionGraphics(basePrompt: string): string {
  const motionElements = [
    "subtle animated gradient flowing from left to right",
    "layered floating particles in background at 10% opacity",
    "soft glow around typography with 2px bloom",
    "gentle wave distortion on accent elements",
    "progressive depth of field focusing on headline",
  ];

  const motionAddition = `[Motion Graphics: ${motionElements.slice(0, 3).join("; ")}]`;
  return `${basePrompt} ${motionAddition}`;
}
