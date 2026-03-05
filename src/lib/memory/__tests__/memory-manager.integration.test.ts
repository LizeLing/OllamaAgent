import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { checkOllamaAvailable } from '@/test/helpers/service-checker';
import { setupTestDataDir } from '@/test/helpers/test-cleanup';

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const EMBEDDING_MODEL = process.env.OLLAMA_EMBEDDING_MODEL || 'qwen3-embedding:8b';

let ollamaAvailable = false;
let cleanup: () => Promise<void>;

// Must dynamically import MemoryManager since it depends on vector-store which reads DATA_DIR
let MemoryManager: typeof import('../memory-manager').MemoryManager;

async function reloadModule() {
  vi.resetModules();
  const mod = await import('../memory-manager');
  MemoryManager = mod.MemoryManager;
}

beforeAll(async () => {
  ollamaAvailable = await checkOllamaAvailable(OLLAMA_URL);
});

describe.skipIf(!ollamaAvailable)('MemoryManager Integration', () => {
  beforeAll(async () => {
    ollamaAvailable = await checkOllamaAvailable(OLLAMA_URL);
  });

  beforeEach(async () => {
    const setup = await setupTestDataDir();
    cleanup = setup.cleanup;
    await reloadModule();
  });

  afterEach(async () => {
    await cleanup();
  });

  it('saveMemory -> searchMemories roundtrip', async () => {
    const manager = new MemoryManager(OLLAMA_URL, EMBEDDING_MODEL);

    const id = await manager.saveMemory('The user prefers dark mode UI');
    expect(id).toBeTruthy();

    const results = await manager.searchMemories('dark mode preference');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]).toContain('dark mode');
  }, 60000);

  it('saveConversationSummary stores conversation data', async () => {
    const manager = new MemoryManager(OLLAMA_URL, EMBEDDING_MODEL);

    await manager.saveConversationSummary(
      'How do I use TypeScript?',
      'TypeScript is a typed superset of JavaScript...'
    );

    const count = await manager.getCount();
    expect(count).toBe(1);

    const results = await manager.searchMemories('TypeScript');
    expect(results.length).toBe(1);
    expect(results[0]).toContain('TypeScript');
  }, 60000);

  it('getCount returns correct number', async () => {
    const manager = new MemoryManager(OLLAMA_URL, EMBEDDING_MODEL);

    expect(await manager.getCount()).toBe(0);

    await manager.saveMemory('Memory one');
    expect(await manager.getCount()).toBe(1);

    await manager.saveMemory('Memory two');
    expect(await manager.getCount()).toBe(2);
  }, 60000);

  it('purgeOld removes expired memories', async () => {
    const manager = new MemoryManager(OLLAMA_URL, EMBEDDING_MODEL);

    await manager.saveMemory('Old memory');

    // Purge with 0 days => everything is old
    const purged = await manager.purgeOld(0);
    expect(purged).toBe(1);
    expect(await manager.getCount()).toBe(0);
  }, 60000);
});
