// Server-side retrieval: given a user query, return the top-K most similar
// knowledge chunks that clear a minimum relevance threshold. This is the
// whole RAG "R" — no response generation happens here, just
// embed -> compare -> filter -> rank -> return.

import knowledgeIndexData from "./knowledge-index.json";
import { embedText } from "./embed";
import { cosineSimilarity } from "./similarity";
import type { KnowledgeIndex, RetrievedChunk } from "./types";

const knowledgeIndex = knowledgeIndexData as KnowledgeIndex;

const DEFAULT_TOP_K = 3;

// Minimum cosine similarity for a chunk to count as relevant.
//
// Why it exists: plain top-K always returns K chunks, however unrelated the
// query. gemini-embedding-001 similarities never sit near 0 for ordinary
// text — an out-of-domain email ("What's the weather today?") still scored
// ~0.56 against the Billing FAQ and ~0.55 against Troubleshooting — so
// without a floor, off-topic emails were handed unrelated excerpts as
// "relevant knowledge" and the UI listed them as sources.
//
// Why 0.60: it sits just above that observed off-topic level while staying
// below the lowest score in the evaluator benchmark's in-domain chunk
// fixtures (0.64, lib/data/evaluator-benchmark.ts). Those fixture scores are
// fixed values, not live measurements, so treat this as a starting point:
// override with KNOWLEDGE_MIN_SIMILARITY (0–1) to tune it without a code
// change. The value is tied to the embedding model and dimensions in
// embed.ts — re-check it if either changes.
const DEFAULT_MIN_SIMILARITY = 0.6;

export function getMinSimilarity(): number {
  const raw = process.env.KNOWLEDGE_MIN_SIMILARITY;
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : DEFAULT_MIN_SIMILARITY;
}

// Thrown for any failure to retrieve knowledge (empty index, missing key,
// embedding API errors that survived embed.ts's retries). A distinct class
// so callers can tell "retrieval failed" apart from "generation failed" and
// report it accordingly, instead of silently proceeding ungrounded.
export class KnowledgeRetrievalError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "KnowledgeRetrievalError";
  }
}

/**
 * Returns up to `topK` chunks scoring at least `minSimilarity`, best first.
 * An empty array is a normal result — it means nothing in the knowledge
 * base is relevant to the query — not a failure.
 */
export async function searchKnowledge(
  query: string,
  topK: number = DEFAULT_TOP_K,
  minSimilarity: number = getMinSimilarity()
): Promise<RetrievedChunk[]> {
  if (knowledgeIndex.chunks.length === 0) {
    throw new KnowledgeRetrievalError(
      "Knowledge index is empty. Run `npm run index:knowledge` to generate lib/ai/knowledge/knowledge-index.json."
    );
  }

  let queryEmbedding: number[];
  try {
    queryEmbedding = await embedText(query, "RETRIEVAL_QUERY");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new KnowledgeRetrievalError(message, { cause: error });
  }

  const relevant: RetrievedChunk[] = knowledgeIndex.chunks
    .map((chunk) => ({
      id: chunk.id,
      source: chunk.source,
      title: chunk.title,
      text: chunk.text,
      score: cosineSimilarity(queryEmbedding, chunk.embedding),
    }))
    .filter((chunk) => chunk.score >= minSimilarity);

  relevant.sort((a, b) => b.score - a.score);

  return relevant.slice(0, topK);
}
