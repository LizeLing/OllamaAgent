// src/lib/storage/__tests__/vector-engine.test.ts
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
  v4: vi.fn().mockReturnValue('test-vec-id'),
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

describe('VectorEngine', () => {
  let VectorEngine: typeof import('../vector-engine').VectorEngine;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    mockFs.readFile.mockRejectedValue(new Error('not found'));
    mockFs.writeFile.mockResolvedValue(undefined);
    mockFs.mkdir.mockResolvedValue(undefined);
    mockFs.unlink.mockResolvedValue(undefined);
    mockAtomicWriteJSON.mockResolvedValue(undefined);

    const mod = await import('../vector-engine');
    VectorEngine = mod.VectorEngine;
  });

  it('namespace에 따라 다른 디렉토리를 사용한다', () => {
    const engine = new VectorEngine('knowledge');
    expect(engine.namespace).toBe('knowledge');
  });

  it('addVector: 벡터 파일과 인덱스를 저장한다', async () => {
    const engine = new VectorEngine('knowledge');
    const id = await engine.addVector('test text', [0.1, 0.2], { key: 'val' });

    expect(id).toBe('test-vec-id');
    expect(mockAtomicWriteJSON).toHaveBeenCalledTimes(2);
    expect(mockAtomicWriteJSON.mock.calls[0][0]).toContain('knowledge');
    expect(mockAtomicWriteJSON.mock.calls[0][0]).toContain('test-vec-id.json');
  });

  it('searchVectors: threshold 이상의 결과를 반환한다', async () => {
    const engine = new VectorEngine('knowledge');
    const index = [
      { id: 'v1', text: 'match', createdAt: 1000 },
      { id: 'v2', text: 'no match', createdAt: 2000 },
    ];
    mockFs.readFile
      .mockResolvedValueOnce(JSON.stringify(index))
      .mockResolvedValueOnce(JSON.stringify({ id: 'v1', text: 'match', vector: [1, 0], createdAt: 1000 }))
      .mockResolvedValueOnce(JSON.stringify({ id: 'v2', text: 'no match', vector: [0, 1], createdAt: 2000 }));

    const results = await engine.searchVectors([1, 0], 5, 0.5);

    expect(results).toHaveLength(1);
    expect(results[0].text).toBe('match');
  });

  it('deleteVector: 파일과 인덱스에서 제거한다', async () => {
    const engine = new VectorEngine('knowledge');
    const index = [
      { id: 'v1', text: 'a', createdAt: 1000 },
      { id: 'v2', text: 'b', createdAt: 2000 },
    ];
    mockFs.readFile.mockResolvedValueOnce(JSON.stringify(index));

    await engine.deleteVector('v1');

    expect(mockFs.unlink).toHaveBeenCalledWith(expect.stringContaining('v1.json'));
  });

  it('getVectorCount: 인덱스 길이를 반환한다', async () => {
    const engine = new VectorEngine('knowledge');
    const index = [{ id: 'v1', text: 'a', createdAt: 1000 }];
    mockFs.readFile.mockResolvedValueOnce(JSON.stringify(index));

    expect(await engine.getVectorCount()).toBe(1);
  });

  it('listVectors: 페이지네이션된 목록을 반환한다', async () => {
    const engine = new VectorEngine('knowledge');
    const index = [
      { id: 'v1', text: 'a', createdAt: 3000 },
      { id: 'v2', text: 'b', createdAt: 2000 },
      { id: 'v3', text: 'c', createdAt: 1000 },
    ];
    mockFs.readFile.mockResolvedValueOnce(JSON.stringify(index));

    const result = await engine.listVectors({ page: 1, limit: 2 });

    expect(result.items).toHaveLength(2);
    expect(result.total).toBe(3);
    expect(result.items[0].id).toBe('v1');
  });

  it('purgeExpired: 만료된 벡터를 삭제한다', async () => {
    const engine = new VectorEngine('knowledge');
    const now = Date.now();
    const old = now - 31 * 24 * 60 * 60 * 1000;
    const index = [
      { id: 'v1', text: 'old', createdAt: old },
      { id: 'v2', text: 'new', createdAt: now },
    ];
    mockFs.readFile.mockResolvedValueOnce(JSON.stringify(index));

    const count = await engine.purgeExpired(30, 1000);

    expect(count).toBe(1);
    expect(mockFs.unlink).toHaveBeenCalledWith(expect.stringContaining('v1.json'));
  });

  it('서로 다른 namespace의 엔진은 서로 영향을 주지 않는다', () => {
    const memoryEngine = new VectorEngine('memory');
    const knowledgeEngine = new VectorEngine('knowledge');
    expect(memoryEngine.namespace).not.toBe(knowledgeEngine.namespace);
  });
});
