// Shared types for the knowledge base / retrieval layer.
//
// A "chunk" is the unit we embed and retrieve: a slice of one knowledge
// document small enough to be a focused, relevant search result on its own.

export type KnowledgeChunk = {
  id: string;
  source: string;
  title: string;
  text: string;
};

export type IndexedChunk = KnowledgeChunk & {
  embedding: number[];
};

export type KnowledgeIndex = {
  model: string;
  dimensions: number;
  generatedAt: string;
  chunks: IndexedChunk[];
};

export type RetrievedChunk = KnowledgeChunk & {
  score: number;
};

// Past email → reply examples (lib/data/past-email-replies.ts). Indexed and
// retrieved like chunks, but used as few-shot style guidance, never as a
// source of company facts.
export type IndexedExample = {
  id: string;
  category: string;
  email: string;
  response: string;
  embedding: number[];
};

export type ExampleIndex = {
  model: string;
  dimensions: number;
  generatedAt: string;
  examples: IndexedExample[];
};

export type RetrievedExample = Omit<IndexedExample, "embedding"> & {
  score: number;
};
