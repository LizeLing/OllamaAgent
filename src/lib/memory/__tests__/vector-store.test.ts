import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFs = {
  readFile: vi.fn(),
  writeFile: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined),
  unlink: vi.fn().mockResolvedValue(undefined),
};

vi.mock('fs/promises', () => ({
  default: mockFs,
}));

vi.mock('uuid', () => ({
  v4: vi.fn().mockReturnValue('test-uuid-1'),
}));

vi.mock('@/lib/config/constants', () => ({
  DATA_DIR: '/tmp/test-data',
}));

const mockAtomicWriteJSON = vi.fn().mockResolvedValue(undefined);
vi.mock('@/lib/storage/atomic-write', () => ({
  atomicWriteJSON: (...args: unknown[]) => mockAtomicWriteJSON(...args),
}));

vi.mock('@/lib/storage/file-lock', () => ({
  withFileLock: (_key: string, fn: () => Promise<unknown>) => fn(),
}));

vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

describe('Vector Store', () => {
  let addVector: typeof import('../vector-store').addVector;
  let searchVectors: typeof import('../vector-store').searchVectors;
  let deleteVector: typeof import('../vector-store').deleteVector;
  let purgeExpiredMemories: typeof import('../vector-store').purgeExpiredMemories;
  let getMemoryCount: typeof import('../vector-store').getMemoryCount;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    // Default: readFile rejects (file not found)
    mockFs.readFile.mockRejectedValue(new Error('not found'));
    mockFs.writeFile.mockResolvedValue(undefined);
    mockFs.mkdir.mockResolvedValue(undefined);
    mockFs.unlink.mockResolvedValue(undefined);
    mockAtomicWriteJSON.mockResolvedValue(undefined);

    const mod = await import('../vector-store');
    addVector = mod.addVector;
    searchVectors = mod.searchVectors;
    deleteVector = mod.deleteVector;
    purgeExpiredMemories = mod.purgeExpiredMemories;
    getMemoryCount = mod.getMemoryCount;
  });

  it('addVector: 파일을 쓰고 인덱스를 업데이트한다', async () => {
    // loadIndex: readFile for index.json → not found (default mock)
    const id = await addVector('hello world', [0.1, 0.2, 0.3], { type: 'test' });

    expect(id).toBe('test-uuid-1');
    // vector file atomicWrite + index atomicWrite
    expect(mockAtomicWriteJSON).toHaveBeenCalledTimes(2);
    const vectorWriteCall = mockAtomicWriteJSON.mock.calls[0];
    expect(vectorWriteCall[0]).toContain('test-uuid-1.json');
  });

  it('searchVectors: threshold 이상의 결과를 유사도순으로 반환한다', async () => {
    const index = [
      { id: 'v1', text: 'similar', createdAt: 1000 },
      { id: 'v2', text: 'different', createdAt: 2000 },
    ];
    // loadIndex call → index data
    mockFs.readFile
      .mockResolvedValueOnce(JSON.stringify(index))  // loadIndex
      .mockResolvedValueOnce(JSON.stringify({         // vector v1
        id: 'v1', text: 'similar', vector: [1, 0, 0], createdAt: 1000,
      }))
      .mockResolvedValueOnce(JSON.stringify({         // vector v2
        id: 'v2', text: 'different', vector: [0, 1, 0], createdAt: 2000,
      }));

    const results = await searchVectors([1, 0, 0], 5, 0.5);

    expect(results).toHaveLength(1);
    expect(results[0].text).toBe('similar');
    expect(results[0].similarity).toBeCloseTo(1.0);
  });

  it('searchVectors: topK 제한을 적용한다', async () => {
    const index = [
      { id: 'v1', text: 'a', createdAt: 1000 },
      { id: 'v2', text: 'b', createdAt: 2000 },
      { id: 'v3', text: 'c', createdAt: 3000 },
    ];
    mockFs.readFile
      .mockResolvedValueOnce(JSON.stringify(index))
      .mockResolvedValueOnce(JSON.stringify({ id: 'v1', text: 'a', vector: [1, 0, 0], createdAt: 1000 }))
      .mockResolvedValueOnce(JSON.stringify({ id: 'v2', text: 'b', vector: [0.9, 0.1, 0], createdAt: 2000 }))
      .mockResolvedValueOnce(JSON.stringify({ id: 'v3', text: 'c', vector: [0.8, 0.2, 0], createdAt: 3000 }));

    const results = await searchVectors([1, 0, 0], 1, 0.0);

    expect(results).toHaveLength(1);
    expect(results[0].text).toBe('a');
  });

  it('deleteVector: 파일과 인덱스 항목을 제거한다', async () => {
    const index = [
      { id: 'v1', text: 'a', createdAt: 1000 },
      { id: 'v2', text: 'b', createdAt: 2000 },
    ];
    // loadIndex
    mockFs.readFile.mockResolvedValueOnce(JSON.stringify(index));

    await deleteVector('v1');

    expect(mockFs.unlink).toHaveBeenCalledWith(expect.stringContaining('v1.json'));
    const indexWrite = mockAtomicWriteJSON.mock.calls.find(
      (call: unknown[]) => (call[0] as string).includes('index.json')
    );
    expect(indexWrite).toBeDefined();
    const written = indexWrite![1] as unknown[];
    expect(written).toHaveLength(1);
    expect((written[0] as { id: string }).id).toBe('v2');
  });

  it('purgeExpiredMemories: 오래된 항목을 제거한다', async () => {
    const now = Date.now();
    const oldTime = now - 31 * 24 * 60 * 60 * 1000; // 31 days ago
    const index = [
      { id: 'v1', text: 'old', createdAt: oldTime },
      { id: 'v2', text: 'new', createdAt: now },
    ];
    // loadIndex
    mockFs.readFile.mockResolvedValueOnce(JSON.stringify(index));

    const purgedCount = await purgeExpiredMemories(30);

    expect(purgedCount).toBe(1);
    expect(mockFs.unlink).toHaveBeenCalledWith(expect.stringContaining('v1.json'));
  });

  it('getMemoryCount: 인덱스 길이를 반환한다', async () => {
    const index = [
      { id: 'v1', text: 'a', createdAt: 1000 },
      { id: 'v2', text: 'b', createdAt: 2000 },
    ];
    mockFs.readFile.mockResolvedValueOnce(JSON.stringify(index));

    const count = await getMemoryCount();
    expect(count).toBe(2);
  });

  it('getMemoryCount: 빈 인덱스에서 0을 반환한다', async () => {
    // readFile rejects by default → loadIndex returns []
    const count = await getMemoryCount();
    expect(count).toBe(0);
  });

  it('searchVectors: 빈 인덱스에서 빈 배열을 반환한다', async () => {
    // readFile rejects by default → loadIndex returns []
    const results = await searchVectors([1, 0, 0], 5, 0.3);
    expect(results).toEqual([]);
  });
});
