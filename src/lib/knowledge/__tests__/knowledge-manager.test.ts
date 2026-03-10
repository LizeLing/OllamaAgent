import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockAddVector = vi.fn().mockResolvedValue('chunk-id-1');
const mockSearchVectors = vi.fn().mockResolvedValue([]);
const mockDeleteVector = vi.fn().mockResolvedValue(undefined);

vi.mock('@/lib/storage/vector-engine', () => ({
  VectorEngine: vi.fn().mockImplementation(function () {
    return {
      addVector: mockAddVector,
      searchVectors: mockSearchVectors,
      deleteVector: mockDeleteVector,
      getVectorCount: vi.fn().mockResolvedValue(0),
    };
  }),
}));

const mockGetEmbedding = vi.fn().mockResolvedValue([0.1, 0.2, 0.3]);
vi.mock('@/lib/memory/embedder', () => ({
  getEmbedding: (...args: unknown[]) => mockGetEmbedding(...args),
}));

const mockAtomicWriteJSON = vi.fn().mockResolvedValue(undefined);
const mockSafeReadJSON = vi.fn();
vi.mock('@/lib/storage/atomic-write', () => ({
  atomicWriteJSON: (...args: unknown[]) => mockAtomicWriteJSON(...args),
  safeReadJSON: (...args: unknown[]) => mockSafeReadJSON(...args),
}));

vi.mock('@/lib/config/constants', () => ({
  DATA_DIR: '/tmp/test-data',
}));

vi.mock('@/lib/storage/file-lock', () => ({
  withFileLock: (_key: string, fn: () => Promise<unknown>) => fn(),
}));

vi.mock('uuid', () => ({
  v4: vi.fn().mockReturnValue('test-id'),
}));

// DocumentParser mock
vi.mock('../document-parser', () => ({
  parseDocument: vi.fn().mockResolvedValue([
    { text: '파싱된 텍스트 1', source: '섹션 1' },
    { text: '파싱된 텍스트 2 '.repeat(30), source: '섹션 2' },
  ]),
  detectFormat: vi.fn().mockReturnValue('text'),
}));

// ChunkStrategy mock
vi.mock('../chunk-strategy', () => ({
  chunkSections: vi.fn().mockReturnValue([
    { text: '청크 1', source: '섹션 1', chunkIndex: 0 },
    { text: '청크 2', source: '섹션 2', chunkIndex: 1 },
  ]),
}));

vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

describe('KnowledgeManager', () => {
  let KnowledgeManager: typeof import('../knowledge-manager').KnowledgeManager;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockSafeReadJSON.mockResolvedValue([]);
    mockAddVector.mockResolvedValue('chunk-id-1');

    const mod = await import('../knowledge-manager');
    KnowledgeManager = mod.KnowledgeManager;
  });

  describe('컬렉션 관리', () => {
    it('컬렉션을 생성할 수 있다', async () => {
      const manager = new KnowledgeManager('http://localhost:11434', 'embed-model');
      const id = await manager.createCollection('GDD 문서');

      expect(id).toBe('test-id');
      expect(mockAtomicWriteJSON).toHaveBeenCalled();
    });

    it('컬렉션 목록을 조회할 수 있다', async () => {
      mockSafeReadJSON.mockResolvedValueOnce([
        { id: 'c1', name: 'GDD', createdAt: 1000 },
      ]);
      const manager = new KnowledgeManager('http://localhost:11434', 'embed-model');
      const collections = await manager.listCollections();

      expect(collections).toHaveLength(1);
      expect(collections[0].name).toBe('GDD');
    });

    it('컬렉션 삭제 시 소속 문서와 청크도 삭제된다', async () => {
      mockSafeReadJSON
        .mockResolvedValueOnce([{ id: 'c1', name: 'GDD', createdAt: 1000 }])
        .mockResolvedValueOnce([{
          id: 'd1', collectionId: 'c1', filename: 'test.md',
          chunkIds: ['ch1', 'ch2'], chunkCount: 2, format: 'md',
          fileSize: 100, createdAt: 1000,
        }]);

      const manager = new KnowledgeManager('http://localhost:11434', 'embed-model');
      await manager.deleteCollection('c1');

      expect(mockDeleteVector).toHaveBeenCalledTimes(2);
      expect(mockAtomicWriteJSON).toHaveBeenCalled();
    });
  });

  describe('문서 관리', () => {
    it('문서를 추가하면 파싱→청킹→임베딩→저장한다', async () => {
      mockSafeReadJSON.mockResolvedValue([]);
      const manager = new KnowledgeManager('http://localhost:11434', 'embed-model');
      const id = await manager.addDocument('c1', 'test.md', Buffer.from('내용'));

      expect(id).toBe('test-id');
      expect(mockGetEmbedding).toHaveBeenCalledTimes(2);
      expect(mockAddVector).toHaveBeenCalledTimes(2);
    });

    it('문서 삭제 시 소속 청크도 삭제된다', async () => {
      mockSafeReadJSON.mockResolvedValueOnce([{
        id: 'd1', collectionId: 'c1', filename: 'test.md',
        chunkIds: ['ch1', 'ch2'], chunkCount: 2, format: 'md',
        fileSize: 100, createdAt: 1000,
      }]);

      const manager = new KnowledgeManager('http://localhost:11434', 'embed-model');
      await manager.deleteDocument('d1');

      expect(mockDeleteVector).toHaveBeenCalledTimes(2);
    });

    it('임베딩 실패 시 저장된 청크를 롤백한다', async () => {
      mockGetEmbedding
        .mockResolvedValueOnce([0.1, 0.2])
        .mockRejectedValueOnce(new Error('Ollama down'));

      mockSafeReadJSON.mockResolvedValue([]);
      const manager = new KnowledgeManager('http://localhost:11434', 'embed-model');

      await expect(manager.addDocument('c1', 'test.md', Buffer.from('내용')))
        .rejects.toThrow();

      expect(mockDeleteVector).toHaveBeenCalled();
    });
  });

  describe('검색', () => {
    it('query를 임베딩하여 벡터 검색한다', async () => {
      mockSearchVectors.mockResolvedValueOnce([
        {
          text: '검색 결과',
          similarity: 0.9,
          metadata: {
            documentId: 'd1', collectionId: 'c1',
            source: '섹션 1', filename: 'test.md',
          },
        },
      ]);

      const manager = new KnowledgeManager('http://localhost:11434', 'embed-model');
      const results = await manager.search('질문');

      expect(results).toHaveLength(1);
      expect(results[0].filename).toBe('test.md');
      expect(results[0].source).toBe('섹션 1');
      expect(mockGetEmbedding).toHaveBeenCalledWith('http://localhost:11434', 'embed-model', '질문');
    });
  });
});
