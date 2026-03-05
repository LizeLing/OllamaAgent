import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setupTestDataDir } from '@/test/helpers/test-cleanup';

let cleanup: () => Promise<void>;

// Dynamic imports for modules that read DATA_DIR at load time
let addVector: typeof import('../vector-store').addVector;
let searchVectors: typeof import('../vector-store').searchVectors;
let deleteVector: typeof import('../vector-store').deleteVector;
let getMemoryCount: typeof import('../vector-store').getMemoryCount;
let purgeExpiredMemories: typeof import('../vector-store').purgeExpiredMemories;

async function reloadModule() {
  vi.resetModules();
  const mod = await import('../vector-store');
  addVector = mod.addVector;
  searchVectors = mod.searchVectors;
  deleteVector = mod.deleteVector;
  getMemoryCount = mod.getMemoryCount;
  purgeExpiredMemories = mod.purgeExpiredMemories;
}

describe('Vector Store Integration', () => {
  beforeEach(async () => {
    const setup = await setupTestDataDir();
    cleanup = setup.cleanup;
    await reloadModule();
  });

  afterEach(async () => {
    await cleanup();
  });

  it('addVector -> searchVectors roundtrip', async () => {
    // Add a vector
    const vector = [1.0, 0.5, 0.0, -0.5];
    const id = await addVector('Hello world test', vector, { type: 'test' });

    expect(id).toBeTruthy();
    expect(typeof id).toBe('string');

    // Search with the same vector (perfect match)
    const results = await searchVectors(vector, 5, 0.1);
    expect(results.length).toBe(1);
    expect(results[0].text).toBe('Hello world test');
    expect(results[0].similarity).toBeCloseTo(1.0, 2);
    expect(results[0].metadata).toEqual({ type: 'test' });
  });

  it('deleteVector removes entry', async () => {
    const vector = [1.0, 0.0, 0.0];
    const id = await addVector('To be deleted', vector);

    expect(await getMemoryCount()).toBe(1);

    await deleteVector(id);

    expect(await getMemoryCount()).toBe(0);
    const results = await searchVectors(vector, 5, 0.1);
    expect(results.length).toBe(0);
  });

  it('purgeExpiredMemories removes old entries', async () => {
    // Add a vector with a fake old timestamp by manipulating the file
    const vector = [1.0, 0.0];
    await addVector('Recent memory', vector);

    // Purge with 0 days max age (everything is expired)
    const purged = await purgeExpiredMemories(0);
    expect(purged).toBe(1);
    expect(await getMemoryCount()).toBe(0);
  });

  it('getMemoryCount returns correct count', async () => {
    expect(await getMemoryCount()).toBe(0);

    await addVector('First', [1.0, 0.0]);
    expect(await getMemoryCount()).toBe(1);

    await addVector('Second', [0.0, 1.0]);
    expect(await getMemoryCount()).toBe(2);
  });

  it('searchVectors respects threshold', async () => {
    // Add two vectors: one similar, one different
    await addVector('Similar', [1.0, 0.0, 0.0]);
    await addVector('Different', [0.0, 0.0, 1.0]);

    // Search with query vector close to "Similar"
    const results = await searchVectors([1.0, 0.0, 0.0], 5, 0.9);
    // Only the similar one should match with threshold 0.9
    expect(results.length).toBe(1);
    expect(results[0].text).toBe('Similar');
  });
});
