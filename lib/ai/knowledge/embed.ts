// Server-only Gemini embedding client.
//
// Separate from lib/ai/provider.ts because embeddings use a different SDK
// call (embedContent, not generateContent) with their own config shape
// (taskType, outputDimensionality). Same rules apply as the rest of lib/ai:
// GEMINI_API_KEY is read from the environment here and only here, and this
// module must never be imported from a "use client" component.

import { ApiError, GoogleGenAI } from "@google/genai";

export type EmbedTaskType = "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY";

// "-001" so we're pinned to a specific, stable embedding model — unlike the
// generation model in provider.ts, embedding vectors must stay consistent
// between indexing and querying, so silently floating to a newer default
// model would risk subtly mismatched vector spaces.
const DEFAULT_EMBEDDING_MODEL = "gemini-embedding-001";

// gemini-embedding-001 natively outputs 3072-dim vectors but supports
// Matryoshka truncation down to smaller sizes via outputDimensionality.
// 768 keeps the committed JSON index small while still being one of
// Google's officially supported/recommended output sizes.
const DEFAULT_OUTPUT_DIMENSIONS = 768;

export function getEmbeddingModel(): string {
  return process.env.GEMINI_EMBEDDING_MODEL ?? DEFAULT_EMBEDDING_MODEL;
}

export function getEmbeddingDimensions(): number {
  const raw = process.env.GEMINI_EMBEDDING_DIMENSIONS;
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_OUTPUT_DIMENSIONS;
}

let cachedClient: GoogleGenAI | null = null;

function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY is not set. Add it to .env.local to generate or query knowledge embeddings."
    );
  }
  if (!cachedClient) {
    cachedClient = new GoogleGenAI({ apiKey });
  }
  return cachedClient;
}

// Retrieval now blocks reply generation (see lib/ai/generate.ts), so
// transient failures get a slightly more patient backoff than
// provider.ts's generation retries — a free-tier 429 rarely clears in
// under a second. Kept to two retries so a genuinely down API still fails
// within a few seconds instead of hanging the request.
const RETRYABLE_STATUS_CODES = new Set([429, 500, 503, 504]);
const RETRY_DELAYS_MS = [1000, 3000];

function isRetryableError(error: unknown): boolean {
  return error instanceof ApiError && RETRYABLE_STATUS_CODES.has(error.status);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Embeds a single piece of text. Use taskType "RETRIEVAL_DOCUMENT" when
 * embedding knowledge chunks to index, and "RETRIEVAL_QUERY" when embedding
 * a user's search query — Gemini's retrieval-oriented task types produce
 * asymmetric embeddings tuned for exactly this document/query split.
 */
export async function embedText(text: string, taskType: EmbedTaskType): Promise<number[]> {
  const client = getClient();
  const model = getEmbeddingModel();
  const outputDimensionality = getEmbeddingDimensions();

  let lastError: unknown;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      const response = await client.models.embedContent({
        model,
        contents: text,
        config: { taskType, outputDimensionality },
      });

      const values = response.embeddings?.[0]?.values;
      if (!values || values.length === 0) {
        throw new Error("Gemini embedding API returned no vector.");
      }
      return values;
    } catch (error) {
      lastError = error;
      if (!isRetryableError(error) || attempt === RETRY_DELAYS_MS.length) {
        break;
      }
      await sleep(RETRY_DELAYS_MS[attempt]);
    }
  }

  const message = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`Gemini embedding request failed: ${message}`);
}
