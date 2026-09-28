// Cosine similarity, implemented by hand rather than pulled from a vector
// library — the whole point of this phase is to make the retrieval
// mechanics visible rather than hidden behind a dependency.

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`Cannot compare vectors of different lengths (${a.length} vs ${b.length}).`);
  }

  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
