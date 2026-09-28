// Loads the raw knowledge documents from knowledge/*.md.
//
// This is intentionally the only place that touches the filesystem for
// knowledge content — chunk.ts and the indexing script both consume its
// output rather than reading files themselves.

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

export type KnowledgeDocument = {
  source: string;
  title: string;
  rawText: string;
};

const KNOWLEDGE_DIR = path.join(process.cwd(), "knowledge");

// The title is the document's first H1 heading ("# Title"). Falling back to
// the filename keeps this from throwing on a malformed doc — it just
// produces a slightly worse title instead of crashing the whole index build.
function extractTitle(source: string, rawText: string): string {
  const match = rawText.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : source.replace(/\.md$/, "");
}

export function loadKnowledgeDocuments(): KnowledgeDocument[] {
  const files = readdirSync(KNOWLEDGE_DIR)
    .filter((f) => f.endsWith(".md"))
    .sort();

  return files.map((source) => {
    const rawText = readFileSync(path.join(KNOWLEDGE_DIR, source), "utf8");
    return { source, title: extractTitle(source, rawText), rawText };
  });
}
