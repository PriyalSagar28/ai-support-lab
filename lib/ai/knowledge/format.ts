// Shared prompt formatting for retrieved knowledge chunks. Used by both
// lib/ai/generate.ts (to draft a grounded reply) and lib/ai/evaluate.ts (to
// judge that reply's groundedness against the same chunks) — kept in one
// place so both prompts describe "the knowledge base" identically instead
// of two formatting implementations silently drifting apart.

import type { RetrievedChunk, RetrievedExample } from "./types";

// Deliberately not wrapped in triple quotes: both lib/ai/generate.ts and
// lib/ai/evaluate.ts build prompts where the email (and, in evaluate's
// case, the reply) are the only `"""..."""`-delimited blocks, because the
// mock provider (lib/ai/provider.ts) extracts those by position. This
// section must not introduce an extra triple-quoted block that would shift
// that position.
export function formatKnowledgeContext(chunks: RetrievedChunk[]): string {
  if (chunks.length === 0) {
    return "(No relevant knowledge base entries were found for this email.)";
  }
  return chunks
    .map((chunk) => `Source: ${chunk.source} — ${chunk.title}\n${chunk.text}`)
    .join("\n---\n");
}

// Past email → reply examples for the generation prompt. Same no-triple-quote
// rule as above. Each example is labeled so the model can't mistake a past
// reply for the current email or for company policy.
export function formatExampleContext(examples: RetrievedExample[]): string {
  if (examples.length === 0) {
    return "(No similar past emails were found.)";
  }
  return examples
    .map(
      (example, i) =>
        `Example ${i + 1} (${example.category})\nPast customer email:\n${example.email}\n\nReply our team sent:\n${example.response}`
    )
    .join("\n---\n");
}
