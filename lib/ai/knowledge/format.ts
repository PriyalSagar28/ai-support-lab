// Shared prompt formatting for retrieved knowledge chunks. Used by both
// lib/ai/generate.ts (to draft a grounded reply) and lib/ai/evaluate.ts (to
// judge that reply's groundedness against the same chunks) — kept in one
// place so both prompts describe "the knowledge base" identically instead
// of two formatting implementations silently drifting apart.

import type { RetrievedChunk } from "./types";

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
