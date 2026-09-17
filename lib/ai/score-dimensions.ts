// The fixed set of evaluation dimensions, plus their prompt descriptions and
// UI display labels. Pure — no imports — so both the server-only evaluate
// module/mock provider AND the client evaluate page can import it directly.
//
// This matters: the page needs these as real runtime values (to render a
// grid of dimension scores), not just types. If it imported them from
// lib/ai/evaluate.ts instead, it would pull that module's entire import
// chain — including lib/ai/provider.ts — into the browser bundle. That's
// harmless today (the mock has no secrets) but would be exactly how a real
// provider's API key leaks to the browser once one exists. Keeping label
// data in provider-free files like this one is what makes "never expose the
// API key to the browser" hold automatically instead of by discipline.

export const SCORE_DIMENSIONS = [
  "toneEmpathy",
  "relevance",
  "clarity",
  "completeness",
  "professionalism",
  "groundedness",
] as const;

export type ScoreDimension = (typeof SCORE_DIMENSIONS)[number];

export const DIMENSION_LABELS: Record<ScoreDimension, string> = {
  toneEmpathy: "Tone & Empathy",
  relevance: "Relevance",
  clarity: "Clarity",
  completeness: "Completeness",
  professionalism: "Professionalism",
  groundedness: "Groundedness (no hallucination)",
};

export const DIMENSION_DESCRIPTIONS: Record<ScoreDimension, string> = {
  toneEmpathy: "warmth and empathy appropriate to the customer's sentiment",
  relevance: "how directly the reply addresses the customer's actual issue",
  clarity: "how easy the reply is to read and understand",
  completeness: "whether the reply covers everything the customer asked",
  professionalism: "polished, appropriate business tone",
  groundedness:
    "avoids inventing facts, promises, policies, or timelines not present in the email (10 = fully grounded, 1 = fabricates freely)",
};
