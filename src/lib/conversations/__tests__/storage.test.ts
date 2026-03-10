import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock fs module (still needed for getConversation, deleteConversation which use fs directly)
const mockFs = {
  mkdir: vi.fn().mockResolvedValue(undefined),
  readFile: vi.fn(),
  writeFile: vi.fn().mockResolvedValue(undefined),
  unlink: vi.fn().mockResolvedValue(undefined),
  rename: vi.fn().mockResolvedValue(undefined),
};

vi.mock('fs/promises', () => ({
  default: mockFs,
}));

vi.mock('@/lib/config/constants', () => ({
  DATA_DIR: '/tmp/test-data',
}));

// Mock atomic-write module (used by readIndex, writeIndex, saveConversation, clearFolderFromConversations)
const mockAtomicWriteJSON = vi.fn().mockResolvedValue(undefined);
const mockSafeReadJSON = vi.fn();

vi.mock('@/lib/storage/atomic-write', () => ({
  atomicWriteJSON: mockAtomicWriteJSON,
  safeReadJSON: mockSafeReadJSON,
}));

describe('Conversation Storage', () => {
  let listConversations: typeof import('../storage').listConversations;
  let getConversation: typeof import('../storage').getConversation;
  let saveConversation: typeof import('../storage').saveConversation;
  let deleteConversation: typeof import('../storage').deleteConversation;
  let searchConversations: typeof import('../storage').searchConversations;
  let clearFolderFromConversations: typeof import('../storage').clearFolderFromConversations;
  let readIndex: typeof import('../storage').readIndex;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    // fs mocks (still used by getConversation, deleteConversation)
    mockFs.readFile.mockRejectedValue(new Error('not found'));
    mockFs.writeFile.mockResolvedValue(undefined);
    mockFs.mkdir.mockResolvedValue(undefined);
    mockFs.unlink.mockResolvedValue(undefined);
    // atomic-write mocks (used by readIndex, writeIndex, saveConversation, clearFolderFromConversations)
    mockSafeReadJSON.mockResolvedValue([]);
    mockAtomicWriteJSON.mockResolvedValue(undefined);

    const mod = await import('../storage');
    listConversations = mod.listConversations;
    getConversation = mod.getConversation;
    saveConversation = mod.saveConversation;
    deleteConversation = mod.deleteConversation;
    searchConversations = mod.searchConversations;
    clearFolderFromConversations = mod.clearFolderFromConversations;
    readIndex = mod.readIndex;
  });

  describe('ID validation', () => {
    it('getConversation에서 path traversal을 거부한다', async () => {
      const result = await getConversation('../../../etc/passwd');
      expect(result).toBeNull();
    });

    it('deleteConversation에서 path traversal을 안전하게 처리한다', async () => {
      await expect(deleteConversation('../etc/passwd')).resolves.not.toThrow();
    });

    it('유효한 UUID ID를 허용한다', async () => {
      const result = await getConversation('abc-123-def');
      expect(result).toBeNull();
    });

    it('특수문자가 포함된 ID를 거부한다', async () => {
      const result = await getConversation('id with spaces');
      expect(result).toBeNull();
    });
  });

  describe('listConversations', () => {
    it('pinned 항목을 먼저, updatedAt 내림차순으로 정렬한다', async () => {
      const index = [
        { id: 'c1', title: 'Old', createdAt: 100, updatedAt: 100, messageCount: 1 },
        { id: 'c2', title: 'New', createdAt: 200, updatedAt: 200, messageCount: 1 },
        { id: 'c3', title: 'Pinned', createdAt: 50, updatedAt: 50, messageCount: 1, pinned: true },
      ];
      mockSafeReadJSON.mockResolvedValueOnce(index);

      const result = await listConversations();

      expect(result[0].id).toBe('c3'); // pinned first
      expect(result[1].id).toBe('c2'); // newer
      expect(result[2].id).toBe('c1'); // older
    });
  });

  describe('saveConversation', () => {
    it('파일을 생성하고 인덱스를 업데이트한다', async () => {
      // readIndex returns empty (default from beforeEach)

      await saveConversation({
        id: 'conv-1',
        title: 'Test',
        createdAt: 1000,
        updatedAt: 1000,
        messageCount: 2,
        messages: [
          { id: 'm1', role: 'user', content: 'hi', timestamp: 1000 },
          { id: 'm2', role: 'assistant', content: 'hello', timestamp: 1001 },
        ],
      });

      // Should write conversation file via atomicWriteJSON
      expect(mockAtomicWriteJSON).toHaveBeenCalledWith(
        expect.stringContaining('conv-1.json'),
        expect.any(Object)
      );
      // Should write index via atomicWriteJSON (conv file + index = 2 calls)
      expect(mockAtomicWriteJSON).toHaveBeenCalledTimes(2);
    });

    it('기존 항목을 업데이트한다', async () => {
      const existingIndex = [
        { id: 'conv-1', title: 'Old Title', createdAt: 1000, updatedAt: 1000, messageCount: 1 },
      ];
      // safeReadJSON for readIndex
      mockSafeReadJSON.mockResolvedValueOnce(existingIndex);

      await saveConversation({
        id: 'conv-1',
        title: 'New Title',
        createdAt: 1000,
        updatedAt: 2000,
        messageCount: 3,
        messages: [
          { id: 'm1', role: 'user', content: 'hi', timestamp: 1000 },
          { id: 'm2', role: 'assistant', content: 'hello', timestamp: 1001 },
          { id: 'm3', role: 'user', content: 'bye', timestamp: 1002 },
        ],
      });

      // The index write via atomicWriteJSON should contain updated title
      const indexWriteCall = mockAtomicWriteJSON.mock.calls.find(
        (call: unknown[]) => (call[0] as string).includes('index.json')
      );
      expect(indexWriteCall).toBeDefined();
      const writtenIndex = indexWriteCall![1] as Array<{ title: string }>;
      expect(writtenIndex[0].title).toBe('New Title');
      expect(writtenIndex).toHaveLength(1);
    });
  });

  describe('deleteConversation', () => {
    it('파일과 인덱스 항목을 제거한다', async () => {
      const index = [
        { id: 'conv-1', title: 'Test', createdAt: 1000, updatedAt: 1000, messageCount: 1 },
        { id: 'conv-2', title: 'Keep', createdAt: 2000, updatedAt: 2000, messageCount: 1 },
      ];
      // readIndex uses safeReadJSON
      mockSafeReadJSON.mockResolvedValueOnce(index);

      await deleteConversation('conv-1');

      // fs.unlink is still used directly for the conversation file
      expect(mockFs.unlink).toHaveBeenCalledWith(expect.stringContaining('conv-1.json'));
      // writeIndex uses atomicWriteJSON
      const indexWriteCall = mockAtomicWriteJSON.mock.calls.find(
        (call: unknown[]) => (call[0] as string).includes('index.json')
      );
      expect(indexWriteCall).toBeDefined();
      const writtenIndex = indexWriteCall![1] as Array<{ id: string }>;
      expect(writtenIndex).toHaveLength(1);
      expect(writtenIndex[0].id).toBe('conv-2');
    });
  });

  describe('searchConversations', () => {
    it('제목 일치를 찾는다', async () => {
      const index = [
        { id: 'c1', title: 'React Tutorial', createdAt: 1000, updatedAt: 1000, messageCount: 1 },
        { id: 'c2', title: 'Vue Guide', createdAt: 2000, updatedAt: 2000, messageCount: 1 },
      ];
      // readIndex uses safeReadJSON
      mockSafeReadJSON.mockResolvedValueOnce(index);

      const results = await searchConversations('react');

      expect(results).toHaveLength(1);
      expect(results[0].matchType).toBe('title');
      expect(results[0].id).toBe('c1');
    });

    it('내용 일치 시 snippet을 반환한다', async () => {
      const index = [
        { id: 'c1', title: 'Chat', createdAt: 1000, updatedAt: 1000, messageCount: 1 },
      ];
      const conversation = {
        id: 'c1',
        title: 'Chat',
        createdAt: 1000,
        updatedAt: 1000,
        messageCount: 1,
        messages: [{ id: 'm1', role: 'user', content: 'How to use TypeScript generics?', timestamp: 1000 }],
      };
      // readIndex uses safeReadJSON
      mockSafeReadJSON.mockResolvedValueOnce(index);
      // getConversation still uses fs.readFile directly
      mockFs.readFile.mockResolvedValueOnce(JSON.stringify(conversation));

      const results = await searchConversations('typescript');

      expect(results).toHaveLength(1);
      expect(results[0].matchType).toBe('content');
      expect(results[0].matchedSnippet).toBeDefined();
    });
  });

  describe('clearFolderFromConversations', () => {
    it('일치하는 대화에서 folderId를 제거한다', async () => {
      const index = [
        { id: 'c1', title: 'A', createdAt: 1000, updatedAt: 1000, messageCount: 1, folderId: 'f1' },
        { id: 'c2', title: 'B', createdAt: 2000, updatedAt: 2000, messageCount: 1, folderId: 'f2' },
      ];
      const conv1 = { id: 'c1', title: 'A', folderId: 'f1', messages: [] };
      // readIndex uses safeReadJSON
      mockSafeReadJSON.mockResolvedValueOnce(index);
      // safeReadJSON for individual conversation c1
      mockSafeReadJSON.mockResolvedValueOnce(conv1);

      await clearFolderFromConversations('f1');

      // Should write updated conversation file via atomicWriteJSON
      const convWriteCall = mockAtomicWriteJSON.mock.calls.find(
        (call: unknown[]) => (call[0] as string).includes('c1.json')
      );
      expect(convWriteCall).toBeDefined();
      const written = convWriteCall![1] as Record<string, unknown>;
      expect(written.folderId).toBeUndefined();
    });
  });

  describe('corrupted index', () => {
    it('손상된 인덱스 파일에서 빈 배열을 반환한다', async () => {
      // safeReadJSON returns default value [] on parse failure
      mockSafeReadJSON.mockResolvedValueOnce([]);

      const result = await listConversations();
      expect(result).toEqual([]);
    });
  });
});
