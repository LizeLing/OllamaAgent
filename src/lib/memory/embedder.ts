import { embed } from '@/lib/ollama/client';

export async function getEmbedding(
  baseUrl: string,
  model: string,
  text: string
): Promise<number[]> {
  const response = await embed(baseUrl, { model, input: text });
  return response.embeddings[0];
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  return denominator === 0 ? 0 : dotProduct / denominator;
}
