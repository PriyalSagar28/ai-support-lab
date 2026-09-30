// Builds the local past-reply example index: embeds the email side of every
// record in lib/data/past-email-replies.ts with the same Gemini embedding
// model as the knowledge index, and writes text + metadata + vectors (no API
// key) to lib/ai/knowledge/example-index.json.
//
// Run with: npm run index:examples
//
// Requires GEMINI_API_KEY (in .env.local or the real environment).

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { pastEmailReplies } from "../lib/data/past-email-replies";
import { embedText, getEmbeddingDimensions, getEmbeddingModel } from "../lib/ai/knowledge/embed";
import type { ExampleIndex, IndexedExample } from "../lib/ai/knowledge/types";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const OUT_PATH = path.join(REPO_ROOT, "lib", "ai", "knowledge", "example-index.json");

// Same as scripts/index-knowledge.ts: never overwrites a variable already set
// in the real environment.
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

  console.log(`Embedding ${pastEmailReplies.length} example(s) with ${getEmbeddingModel()} (${getEmbeddingDimensions()} dimensions)`);

  const examples: IndexedExample[] = [];
  for (const [i, example] of pastEmailReplies.entries()) {
    process.stdout.write(`- [${i + 1}/${pastEmailReplies.length}] ${example.id} ... `);
    // Only the email is embedded: retrieval matches an incoming email to
    // similar past emails, not to past replies.
    const embedding = await embedText(example.email, "RETRIEVAL_DOCUMENT");
    examples.push({ ...example, embedding });
    console.log(`ok (${embedding.length}-dim)`);
    if (i < pastEmailReplies.length - 1) await sleep(200);
  }

  const index: ExampleIndex = {
    model: getEmbeddingModel(),
    dimensions: getEmbeddingDimensions(),
    generatedAt: new Date().toISOString(),
    examples,
  };

  writeFileSync(OUT_PATH, JSON.stringify(index, null, 2));
  console.log(`\nWrote ${examples.length} embedded example(s) to ${path.relative(REPO_ROOT, OUT_PATH)}`);
}

main().catch((error) => {
  console.error("Example indexing failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
