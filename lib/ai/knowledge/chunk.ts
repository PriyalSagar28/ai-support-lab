// Splits a knowledge document into retrieval-sized chunks.
//
// Kept deliberately simple: split on "## " section headings (our knowledge
// docs are all written that way), then, only if a section is still long,
// split further on paragraph breaks and group paragraphs back together up
// to MAX_CHUNK_CHARS. Each chunk keeps its section heading as a prefix so
// it reads sensibly on its own, out of context from the rest of the doc.

import type { KnowledgeDocument } from "./load-documents";
import type { KnowledgeChunk } from "./types";

const MAX_CHUNK_CHARS = 700;

type Section = {
  heading: string;
  body: string;
};

// Drops the leading "# Title" line, then splits the rest on "## " headings.
function splitIntoSections(rawText: string): Section[] {
  const withoutTitle = rawText.replace(/^#\s+.+\n?/, "").trim();
  const parts = withoutTitle.split(/\n(?=##\s+)/g);

  return parts
    .map((part) => {
      const headingMatch = part.match(/^##\s+(.+)$/m);
      const heading = headingMatch ? headingMatch[1].trim() : "";
      const body = part.replace(/^##\s+.+\n?/, "").trim();
      return { heading, body };
    })
    .filter((section) => section.body.length > 0);
}

// Greedily groups paragraphs so each chunk stays close to MAX_CHUNK_CHARS
// without splitting a paragraph in half.
function groupParagraphs(paragraphs: string[]): string[] {
  const groups: string[] = [];
  let current = "";

  for (const paragraph of paragraphs) {
    const candidate = current ? `${current}\n\n${paragraph}` : paragraph;
    if (candidate.length > MAX_CHUNK_CHARS && current) {
      groups.push(current);
      current = paragraph;
    } else {
      current = candidate;
    }
  }
  if (current) groups.push(current);

  return groups;
}

export function chunkDocument(doc: KnowledgeDocument): KnowledgeChunk[] {
  const sections = splitIntoSections(doc.rawText);
  const chunks: KnowledgeChunk[] = [];

  for (const section of sections) {
    const paragraphs = section.body.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
    const bodyGroups =
      section.body.length <= MAX_CHUNK_CHARS ? [section.body] : groupParagraphs(paragraphs);

    for (const group of bodyGroups) {
      const text = section.heading ? `${section.heading}\n\n${group}` : group;
      chunks.push({
        id: `${doc.source}#${chunks.length}`,
        source: doc.source,
        title: doc.title,
        text,
      });
    }
  }

  return chunks;
}

export function chunkDocuments(docs: KnowledgeDocument[]): KnowledgeChunk[] {
  return docs.flatMap(chunkDocument);
}
