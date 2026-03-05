import { describe, it, expect, beforeAll } from 'vitest';
import { checkOllamaAvailable } from '@/test/helpers/service-checker';
import { getEmbedding, cosineSimilarity } from '../embedder';

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const EMBEDDING_MODEL = process.env.OLLAMA_EMBEDDING_MODEL || 'qwen3-embedding:8b';

let ollamaAvailable = false;

beforeAll(async () => {
  ollamaAvailable = await checkOllamaAvailable(OLLAMA_URL);
});

describe.skipIf(!ollamaAvailable)('Embedder Integration', () => {
  beforeAll(async () => {
    ollamaAvailable = await checkOllamaAvailable(OLLAMA_URL);
  });

  it('real embedding generation returns array of numbers', async () => {
    const embedding = await getEmbedding(OLLAMA_URL, EMBEDDING_MODEL, 'Hello world');

    expect(Array.isArray(embedding)).toBe(true);
    expect(embedding.length).toBeGreaterThan(0);
    expect(typeof embedding[0]).toBe('number');
    // Typical embedding dimensions are > 100
    expect(embedding.length).toBeGreaterThan(100);
  }, 30000);

  it('similar texts have high cosine similarity', async () => {
    const emb1 = await getEmbedding(OLLAMA_URL, EMBEDDING_MODEL, 'The cat sat on the mat');
    const emb2 = await getEmbedding(OLLAMA_URL, EMBEDDING_MODEL, 'A cat was sitting on the mat');

    const similarity = cosineSimilarity(emb1, emb2);
    // Similar sentences should have high similarity
    expect(similarity).toBeGreaterThan(0.7);
  }, 30000);

  it('different texts have lower similarity', async () => {
    const emb1 = await getEmbedding(OLLAMA_URL, EMBEDDING_MODEL, 'TypeScript programming language features');
    const emb2 = await getEmbedding(OLLAMA_URL, EMBEDDING_MODEL, 'chocolate cake recipe with frosting');

    const similarity = cosineSimilarity(emb1, emb2);
    // Very different topics should have lower similarity
    expect(similarity).toBeLessThan(0.7);
  }, 30000);
});
