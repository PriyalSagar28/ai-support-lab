// Builds the local knowledge index: loads knowledge/*.md, chunks each
// document, embeds every chunk with the Gemini embedding API, and writes
// the result (text + metadata + vectors, no API key) to
// lib/ai/knowledge/knowledge-index.json.
//
// Run with: npm run index:knowledge
//
// Requires GEMINI_API_KEY (in .env.local or the real environment) — this
// script always talks to the real Gemini embedding API, independent of the
// AI_PROVIDER switch used for text generation elsewhere in the app, since
// there is no mock embedding provider.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadKnowledgeDocuments } from "../lib/ai/knowledge/load-documents";
import { chunkDocuments } from "../lib/ai/knowledge/chunk";
import { embedText, getEmbeddingDimensions, getEmbeddingModel } from "../lib/ai/knowledge/embed";
import type { IndexedChunk, KnowledgeIndex } from "../lib/ai/knowledge/types";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const OUT_PATH = path.join(REPO_ROOT, "lib", "ai", "knowledge", "knowledge-index.json");

// Same reasoning as scripts/evaluate-batch.ts: Next.js loads .env.local
// automatically, but this standalone script has to do it itself. Never
// overwrites a variable already set in the real environment.
function loadEnvLocal(): void {
  const envPath = path.join(REPO_ROOT, ".env.local");
  if (!existsSync(envPath)) return;

  const contents = readFileSync(envPath, "utf8");
  for (const line of contents.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (key && !(key in process.env)) {
      process.env[key] = value;
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  loadEnvLocal();

  if (!process.env.GEMINI_API_KEY) {
    console.error("GEMINI_API_KEY is not set. Add it to .env.local before running this script.");
    process.exit(1);
  }

  const docs = loadKnowledgeDocuments();
  const chunks = chunkDocuments(docs);

  console.log(`Loaded ${docs.length} document(s) -> ${chunks.length} chunk(s).`);
  console.log(`Embedding model: ${getEmbeddingModel()} (${getEmbeddingDimensions()} dimensions)`);

  const indexedChunks: IndexedChunk[] = [];
  // Sequential, with a small pause between calls, mirrors the pacing
  // approach in scripts/evaluate-batch.ts — this is a one-time/occasional
  // build step, not a latency-sensitive path, so simplicity wins over
  // parallelizing the requests.
  for (const [i, chunk] of chunks.entries()) {
    process.stdout.write(`- [${i + 1}/${chunks.length}] ${chunk.id} ... `);
    const embedding = await embedText(chunk.text, "RETRIEVAL_DOCUMENT");
    indexedChunks.push({ ...chunk, embedding });
    console.log(`ok (${embedding.length}-dim)`);
    if (i < chunks.length - 1) await sleep(200);
  }

  const index: KnowledgeIndex = {
    model: getEmbeddingModel(),
    dimensions: getEmbeddingDimensions(),
    generatedAt: new Date().toISOString(),
    chunks: indexedChunks,
  };

  writeFileSync(OUT_PATH, JSON.stringify(index, null, 2));
  console.log(`\nWrote ${indexedChunks.length} embedded chunk(s) to ${path.relative(REPO_ROOT, OUT_PATH)}`);
}

main().catch((error) => {
  console.error("Knowledge indexing failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
