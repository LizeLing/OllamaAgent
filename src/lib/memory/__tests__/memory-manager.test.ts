import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../embedder', () => ({
  getEmbedding: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
}));

vi.mock('../vector-store', () => ({
  addVector: vi.fn().mockResolvedValue('vec-id-1'),
  searchVectors: vi.fn().mockResolvedValue([
    { text: 'memory 1', similarity: 0.9 },
    { text: 'memory 2', similarity: 0.8 },
  ]),
  purgeExpiredMemories: vi.fn().mockResolvedValue(5),
  getMemoryCount: vi.fn().mockResolvedValue(42),
}));

import { MemoryManager } from '../memory-manager';
import { getEmbedding } from '../embedder';
import { addVector, searchVectors, getMemoryCount } from '../vector-store';

describe('MemoryManager', () => {
  let manager: MemoryManager;

  beforeEach(() => {
    vi.clearAllMocks();
    manager = new MemoryManager('http://localhost:11434', 'embed-model');
  });

  it('saveMemory는 getEmbedding + addVector에 위임한다', async () => {
    const id = await manager.saveMemory('important fact', { type: 'note' });

    expect(getEmbedding).toHaveBeenCalledWith('http://localhost:11434', 'embed-model', 'important fact');
    expect(addVector).toHaveBeenCalledWith('important fact', [0.1, 0.2, 0.3], { type: 'note' });
    expect(id).toBe('vec-id-1');
  });

  it('searchMemories는 텍스트 배열을 반환한다', async () => {
    const results = await manager.searchMemories('query', 3);

    expect(getEmbedding).toHaveBeenCalledWith('http://localhost:11434', 'embed-model', 'query');
    expect(searchVectors).toHaveBeenCalled();
    expect(results).toEqual(['memory 1', 'memory 2']);
  });

  it('saveConversationSummary는 user(200)와 assistant(500)를 truncate한다', async () => {
    const longUser = 'u'.repeat(300);
    const longAssistant = 'a'.repeat(700);

    await manager.saveConversationSummary(longUser, longAssistant);

    const savedText = vi.mocked(addVector).mock.calls[0][0] as string;
    const userPart = savedText.split('\n')[0];
    const assistantPart = savedText.split('\n')[1];
    // "User: " prefix (6 chars) + 200 chars
    expect(userPart.length).toBeLessThanOrEqual(206);
    // "Assistant: " prefix (11 chars) + 500 chars
    expect(assistantPart.length).toBeLessThanOrEqual(511);
  });

  it('getCount는 getMemoryCount에 위임한다', async () => {
    const count = await manager.getCount();

    expect(getMemoryCount).toHaveBeenCalled();
    expect(count).toBe(42);
  });
});
