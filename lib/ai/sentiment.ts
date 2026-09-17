// Phase 2: sentiment analysis.
//
// Same shape as lib/ai/categorize.ts: build a prompt, call the active
// provider, validate the response. This module never talks to a vendor SDK
// directly, so swapping providers later doesn't touch this file.

import { getProvider } from "./provider";
import { SENTIMENTS, URGENCIES, type Sentiment, type Urgency } from "./sentiment-labels";

export { SENTIMENTS, URGENCIES };
export type { Sentiment, Urgency };

export type SentimentResult = {
  sentiment: Sentiment;
  urgency: Urgency;
  confidence: number;
  explanation: string;
};

function buildPrompt(email: string): string {
  return `You are a support triage assistant analyzing the emotional tone and urgency of a customer email.

Determine:
- sentiment: overall emotional tone, one of ${SENTIMENTS.join(" / ")}
- urgency: how time-sensitive the request is, one of ${URGENCIES.join(" / ")}

Respond with ONLY a single JSON object (no extra text, no markdown fences) in exactly this shape:
{"sentiment": "<one of ${SENTIMENTS.join(" | ")}>", "urgency": "<one of ${URGENCIES.join(" | ")}>", "confidence": <number between 0 and 1>, "explanation": "<one sentence explaining why>"}

Email:
"""
${email.trim()}
"""`;
}

function isSentiment(value: unknown): value is Sentiment {
  return typeof value === "string" && (SENTIMENTS as readonly string[]).includes(value);
}

function isUrgency(value: unknown): value is Urgency {
  return typeof value === "string" && (URGENCIES as readonly string[]).includes(value);
}

/**
 * Parses and validates a raw provider response against the expected
 * {sentiment, urgency, confidence, explanation} shape. Throws a descriptive
 * error if the model returned something we can't trust.
 */
export function parseSentimentResponse(raw: string): SentimentResult {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error("Model response was not valid JSON.");
  }

  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("Model response was not a JSON object.");
  }

  const { sentiment, urgency, confidence, explanation } = parsed as Record<string, unknown>;

  if (!isSentiment(sentiment)) {
    throw new Error(`Model returned an unknown sentiment: ${JSON.stringify(sentiment)}`);
  }
  if (!isUrgency(urgency)) {
    throw new Error(`Model returned an unknown urgency: ${JSON.stringify(urgency)}`);
  }
  if (typeof confidence !== "number" || Number.isNaN(confidence) || confidence < 0 || confidence > 1) {
    throw new Error(`Model returned an invalid confidence value: ${JSON.stringify(confidence)}`);
  }
  if (typeof explanation !== "string" || explanation.trim().length === 0) {
    throw new Error("Model did not return an explanation.");
  }

  return { sentiment, urgency, confidence, explanation };
}

export async function analyzeSentiment(email: string): Promise<SentimentResult> {
  const provider = getProvider();
  const prompt = buildPrompt(email);
  const raw = await provider.complete(prompt);
  return parseSentimentResponse(raw);
}
