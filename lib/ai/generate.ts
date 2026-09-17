// Phase 3: AI response generation.
//
// Generates a suggested reply to a customer email, informed by the
// sentiment/urgency signals from Phase 2 (lib/ai/sentiment.ts) rather than
// guessing tone from scratch. Same provider-agnostic shape as the other
// modules: build a prompt, call getProvider(), validate the response.

import { getProvider } from "./provider";
import { analyzeSentiment, type Sentiment, type Urgency } from "./sentiment";

export type GenerateResult = {
  reply: string;
  sentiment: Sentiment;
  urgency: Urgency;
};

function buildPrompt(email: string, sentiment: Sentiment, urgency: Urgency): string {
  return `You are a customer support agent drafting a reply to a customer email.

Detected customer sentiment: ${sentiment}
Detected urgency: ${urgency}

Write a professional, empathetic, and concise reply that:
- Directly addresses the issue described in the email
- Uses a tone appropriate for a ${sentiment.toLowerCase()} sentiment and ${urgency.toLowerCase()} urgency situation
- Does not invent specific facts (refund amounts, dates, ticket numbers) that aren't in the email
- Signs off politely

Respond with ONLY a single JSON object (no extra text, no markdown fences) in exactly this shape:
{"reply": "<the full reply text, using \\n for line breaks>"}

Customer email:
"""
${email.trim()}
"""`;
}

function parseGenerateResponse(raw: string): { reply: string } {
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

  const { reply } = parsed as Record<string, unknown>;

  if (typeof reply !== "string" || reply.trim().length === 0) {
    throw new Error("Model did not return reply text.");
  }

  return { reply };
}

/**
 * `precomputed` lets a caller that already ran sentiment analysis (the
 * Phase 5 pipeline, which computes it once and reuses it here) skip a
 * redundant analyzeSentiment() call. Omit it to keep the original Phase 3
 * behavior of deriving sentiment/urgency internally.
 */
export async function generateReply(
  email: string,
  precomputed?: { sentiment: Sentiment; urgency: Urgency }
): Promise<GenerateResult> {
  const provider = getProvider();
  const { sentiment, urgency } = precomputed ?? (await analyzeSentiment(email));
  const prompt = buildPrompt(email, sentiment, urgency);
  const raw = await provider.complete(prompt);
  const { reply } = parseGenerateResponse(raw);
  return { reply, sentiment, urgency };
}
