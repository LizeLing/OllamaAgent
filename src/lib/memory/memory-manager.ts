import { getEmbedding } from './embedder';
import { addVector, searchVectors } from './vector-store';

export class MemoryManager {
  constructor(
    private ollamaUrl: string,
    private embeddingModel: string
  ) {}

  async saveMemory(text: string, metadata?: Record<string, unknown>): Promise<string> {
    try {
      const vector = await getEmbedding(this.ollamaUrl, this.embeddingModel, text);
      return await addVector(text, vector, metadata);
    } catch (err) {
      console.error('Failed to save memory:', err);
      throw err;
    }
  }

  async searchMemories(query: string, topK: number = 5): Promise<string[]> {
    try {
      const queryVector = await getEmbedding(this.ollamaUrl, this.embeddingModel, query);
      const results = await searchVectors(queryVector, topK);
      return results.map((r) => r.text);
    } catch (err) {
      console.error('Failed to search memories:', err);
      return [];
    }
  }

  async saveConversationSummary(
    userMessage: string,
    assistantResponse: string
  ): Promise<void> {
    const summary = `User: ${userMessage.slice(0, 200)}\nAssistant: ${assistantResponse.slice(0, 500)}`;
    await this.saveMemory(summary, { type: 'conversation' });
  }
}
