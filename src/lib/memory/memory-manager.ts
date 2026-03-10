import { getEmbedding } from './embedder';
import { addVector, searchVectors, purgeExpiredMemories, getMemoryCount } from './vector-store';
import { scrubMemoryText } from './scrubber';
import { categorizeMemory, getMemoryWeight, type MemoryCategory } from './structured-memory';
import type { MemoryCategoryConfig } from '@/types/settings';
import { logger } from '@/lib/logger';

export class MemoryManager {
  constructor(
    private ollamaUrl: string,
    private embeddingModel: string,
    private memoryCategories?: Record<string, MemoryCategoryConfig>
  ) {}

  async saveMemory(text: string, metadata?: Record<string, unknown>): Promise<string> {
    try {
      const vector = await getEmbedding(this.ollamaUrl, this.embeddingModel, text);
      return await addVector(text, vector, metadata);
    } catch (err) {
      logger.error('MEMORY', 'Failed to save memory', err);
      throw err;
    }
  }

  async searchMemories(query: string, topK: number = 5): Promise<string[]> {
    try {
      const queryVector = await getEmbedding(this.ollamaUrl, this.embeddingModel, query);
      const results = await searchVectors(queryVector, topK);

      // 카테고리 가중치를 유사도에 곱하여 정렬
      const weighted = results.map((r) => {
        const category = (r.metadata?.category as MemoryCategory) || 'general';
        const weight = getMemoryWeight(category, this.memoryCategories);
        return {
          text: r.text,
          weightedSimilarity: r.similarity * weight,
        };
      });

      weighted.sort((a, b) => b.weightedSimilarity - a.weightedSimilarity);
      return weighted.map((r) => r.text);
    } catch (err) {
      logger.error('MEMORY', 'Failed to search memories', err);
      return [];
    }
  }

  async purgeOld(maxAgeDays: number = 30, maxCount: number = 1000): Promise<number> {
    return purgeExpiredMemories(maxAgeDays, maxCount);
  }

  async getCount(): Promise<number> {
    return getMemoryCount();
  }

  async saveConversationSummary(
    userMessage: string,
    assistantResponse: string
  ): Promise<void> {
    const rawSummary = `User: ${userMessage.slice(0, 200)}\nAssistant: ${assistantResponse.slice(0, 500)}`;
    const summary = scrubMemoryText(rawSummary);
    const category = categorizeMemory(summary);
    await this.saveMemory(summary, { type: 'conversation', category });
  }
}
