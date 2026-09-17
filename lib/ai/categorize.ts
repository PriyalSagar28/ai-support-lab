// Phase 1: email categorization.
//
// This module owns the whole categorize capability: building the prompt,
// calling the active AI provider, and validating the response shape. It
// never talks to a vendor SDK directly — that's `getProvider()`'s job — so
// swapping the mock provider for a real one later means editing
// lib/ai/provider.ts only, not this file or the API route that calls it.

import { getProvider } from "./provider";
import { CATEGORIES, type Category } from "./categories";

export { CATEGORIES };
export type { Category };

export type CategorizeResult = {
  category: Category;
  confidence: number;
  reason: string;
};

function buildPrompt(email: string): string {
  return `You are an email triage assistant for a customer support team.

Classify the following customer email into exactly one of these categories:
${CATEGORIES.map((c) => `- ${c}`).join("\n")}

Respond with ONLY a single JSON object (no extra text, no markdown fences) in exactly this shape:
{"category": "<one of the categories above, verbatim>", "confidence": <number between 0 and 1>, "reason": "<one sentence explaining why>"}

Email:
"""
${email.trim()}
"""`;
}

function isCategory(value: unknown): value is Category {
  return typeof value === "string" && (CATEGORIES as readonly string[]).includes(value);
}

/**
 * Parses and validates a raw provider response against the expected
 * {category, confidence, reason} shape. Throws a descriptive error if the
 * model returned something we can't trust — callers decide how to surface
 * that (the API route turns it into a 502).
 */
export function parseCategorizeResponse(raw: string): CategorizeResult {
  // Real models sometimes wrap JSON in markdown code fences; strip them
  // defensively even though the mock provider never does this.
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

  const { category, confidence, reason } = parsed as Record<string, unknown>;

  if (!isCategory(category)) {
    throw new Error(`Model returned an unknown category: ${JSON.stringify(category)}`);
  }
  if (typeof confidence !== "number" || Number.isNaN(confidence) || confidence < 0 || confidence > 1) {
    throw new Error(`Model returned an invalid confidence value: ${JSON.stringify(confidence)}`);
  }
  if (typeof reason !== "string" || reason.trim().length === 0) {
    throw new Error("Model did not return a reason.");
  }

  return { category, confidence, reason };
}

export async function categorizeEmail(email: string): Promise<CategorizeResult> {
  const provider = getProvider();
  const prompt = buildPrompt(email);
  const raw = await provider.complete(prompt);
  return parseCategorizeResponse(raw);
}
