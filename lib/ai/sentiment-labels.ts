// The fixed sentiment/urgency labels. Shared by the sentiment module (prompt
// + validation) and the mock provider (keyword heuristics) — same pattern as
// lib/ai/categories.ts, and split out for the same reason: it lets the mock
// provider import the label types without creating a circular import with
// lib/ai/sentiment.ts (which imports the provider).

export const SENTIMENTS = ["Positive", "Neutral", "Negative"] as const;
export type Sentiment = (typeof SENTIMENTS)[number];

export const URGENCIES = ["Low", "Medium", "High"] as const;
export type Urgency = (typeof URGENCIES)[number];
