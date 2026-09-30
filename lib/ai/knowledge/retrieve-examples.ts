// Retrieval over past email → reply examples (lib/data/past-email-replies.ts).
// Same mechanics as retrieve.ts — embed the incoming email, cosine-compare
// against a committed JSON index, filter by a floor, rank — but a separate
// index, because examples play a different role in the prompt: they show
// how similar requests were answered, never which facts are true.

import exampleIndexData from "./example-index.json";
import { embedText } from "./embed";
import { cosineSimilarity } from "./similarity";
import { KnowledgeRetrievalError } from "./retrieve";
import type { ExampleIndex, RetrievedExample } from "./types";

const exampleIndex = exampleIndexData as ExampleIndex;

// Two examples show a pattern without crowding out the knowledge base.
const DEFAULT_TOP_K = 2;

// Why 0.60, as for knowledge chunks: measured against this index, every
// evaluation email in sample-emails.ts had a best match between 0.62 and
// 0.80, while plain off-topic queries (weather, Netflix/Spotify pricing)
// peaked at 0.58. An off-topic email written like a support request can
// still clear the floor (~0.65 for a Netflix-plans email), which is why
// generate.ts only searches after the support-scope guard passes the email.
// Override with EXAMPLES_MIN_SIMILARITY (0–1).
const DEFAULT_MIN_SIMILARITY = 0.6;

export function getExampleMinSimilarity(): number {
  const raw = process.env.EXAMPLES_MIN_SIMILARITY;
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : DEFAULT_MIN_SIMILARITY;
}

/**
 * Returns up to `topK` past examples scoring at least `minSimilarity`, best
 * first. An empty array is a normal result. Failures throw
 * KnowledgeRetrievalError, like knowledge retrieval, so the API route
 * reports them the same way.
 */
export async function searchExamples(
  query: string,
  topK: number = DEFAULT_TOP_K,
  minSimilarity: number = getExampleMinSimilarity()
): Promise<RetrievedExample[]> {
  if (exampleIndex.examples.length === 0) {
    throw new KnowledgeRetrievalError(
      "Example index is empty. Run `npm run index:examples` to generate lib/ai/knowledge/example-index.json."
    );
  }

  let queryEmbedding: number[];
  try {
    queryEmbedding = await embedText(query, "RETRIEVAL_QUERY");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new KnowledgeRetrievalError(message, { cause: error });
  }

  return exampleIndex.examples
    .map(({ embedding, ...example }) => ({ ...example, score: cosineSimilarity(queryEmbedding, embedding) }))
    .filter((example) => example.score >= minSimilarity)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}
