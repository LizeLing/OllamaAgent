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
  let rewindConversation: typeof import('../storage').rewindConversation;
  let forkConversation: typeof import('../storage').forkConversation;

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
    rewindConversation = mod.rewindConversation;
    forkConversation = mod.forkConversation;
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

  describe('rewindConversation', () => {
    function buildConv(id: string, messageCount: number) {
      const messages = Array.from({ length: messageCount }, (_, i) => ({
        id: `m${i}`,
        role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
        content: `msg-${i}`,
        timestamp: 1000 + i,
      }));
      return {
        id,
        title: 'Rewind Target',
        createdAt: 1000,
        updatedAt: 2000,
        messageCount,
        messages,
      };
    }

    it('10개 메시지에서 index=5로 되감으면 앞쪽 6개만 남는다 (inclusive)', async () => {
      const conv = buildConv('rw-1', 10);
      mockFs.readFile.mockResolvedValueOnce(JSON.stringify(conv));
      mockSafeReadJSON.mockResolvedValueOnce([]);

      const result = await rewindConversation('rw-1', 5);

      // inclusive slice: index 5 포함 → 길이 6
      expect(result.messages).toHaveLength(6);
      expect(result.messages[result.messages.length - 1].id).toBe('m5');
    });

    it('metadata.rewoundFrom에 이전 길이와 인덱스를 기록한다', async () => {
      const conv = buildConv('rw-2', 10);
      mockFs.readFile.mockResolvedValueOnce(JSON.stringify(conv));
      mockSafeReadJSON.mockResolvedValueOnce([]);

      const before = Date.now();
      const result = await rewindConversation('rw-2', 3);
      const after = Date.now();

      expect(result.rewoundFrom).toBeDefined();
      expect(result.rewoundFrom!.messageIndex).toBe(3);
      expect(result.rewoundFrom!.previousLength).toBe(10);
      expect(result.rewoundFrom!.rewoundAt).toBeGreaterThanOrEqual(before);
      expect(result.rewoundFrom!.rewoundAt).toBeLessThanOrEqual(after);
    });

    it('존재하지 않는 conversation id이면 파일 읽기 에러가 throw된다', async () => {
      mockFs.readFile.mockRejectedValueOnce(new Error('ENOENT'));

      await expect(rewindConversation('rw-missing', 0)).rejects.toThrow();
    });

    it('음수 messageIndex를 거부한다', async () => {
      await expect(rewindConversation('rw-neg', -1)).rejects.toThrow(/Invalid messageIndex/);
    });

    it('비정수 messageIndex를 거부한다', async () => {
      await expect(rewindConversation('rw-frac', 1.5)).rejects.toThrow(/Invalid messageIndex/);
    });

    it('messages.length 이상의 messageIndex를 거부한다', async () => {
      const conv = buildConv('rw-out', 3);
      mockFs.readFile.mockResolvedValueOnce(JSON.stringify(conv));
      mockSafeReadJSON.mockResolvedValueOnce([]);

      await expect(rewindConversation('rw-out', 3)).rejects.toThrow(/messageIndex/);
    });

    it('원본 대화 파일을 truncated 버전으로 덮어쓴다', async () => {
      const conv = buildConv('rw-3', 10);
      mockFs.readFile.mockResolvedValueOnce(JSON.stringify(conv));
      mockSafeReadJSON.mockResolvedValueOnce([]);

      await rewindConversation('rw-3', 4);

      const convWriteCall = mockAtomicWriteJSON.mock.calls.find(
        (call: unknown[]) => (call[0] as string).includes('rw-3.json')
      );
      expect(convWriteCall).toBeDefined();
      const written = convWriteCall![1] as { messages: unknown[]; id: string };
      expect(written.id).toBe('rw-3');
      expect(written.messages).toHaveLength(5);
    });

    it('updatedAt을 현재 시각으로 갱신하고 messageCount를 조정한다', async () => {
      const conv = buildConv('rw-4', 8);
      mockFs.readFile.mockResolvedValueOnce(JSON.stringify(conv));
      mockSafeReadJSON.mockResolvedValueOnce([]);

      const before = Date.now();
      const result = await rewindConversation('rw-4', 2);

      expect(result.updatedAt).toBeGreaterThanOrEqual(before);
      expect(result.messageCount).toBe(3);
    });

    it('인덱스에 기존 항목이 있으면 해당 항목을 업데이트한다', async () => {
      const conv = buildConv('rw-5', 6);
      const existingIndex = [
        { id: 'rw-5', title: 'Rewind Target', createdAt: 1000, updatedAt: 2000, messageCount: 6 },
      ];
      mockFs.readFile.mockResolvedValueOnce(JSON.stringify(conv));
      mockSafeReadJSON.mockResolvedValueOnce(existingIndex);

      await rewindConversation('rw-5', 2);

      const indexWrite = mockAtomicWriteJSON.mock.calls.find(
        (call: unknown[]) => (call[0] as string).includes('index.json')
      );
      expect(indexWrite).toBeDefined();
      const writtenIndex = indexWrite![1] as Array<{ id: string; messageCount: number; rewoundFrom?: unknown }>;
      expect(writtenIndex).toHaveLength(1);
      expect(writtenIndex[0].id).toBe('rw-5');
      expect(writtenIndex[0].messageCount).toBe(3);
      expect(writtenIndex[0].rewoundFrom).toBeDefined();
    });
  });

  describe('forkConversation', () => {
    function buildConv(id: string, messageCount: number) {
      const messages = Array.from({ length: messageCount }, (_, i) => ({
        id: `m${i}`,
        role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
        content: `msg-${i}`,
        timestamp: 1000 + i,
      }));
      return {
        id,
        title: 'Fork Source',
        createdAt: 1000,
        updatedAt: 2000,
        messageCount,
        messages,
      };
    }

    it('원본 대화의 파일 내용은 변경되지 않는다 (읽기만 수행)', async () => {
      const conv = buildConv('fk-1', 10);
      // getConversation reads via fs.readFile
      mockFs.readFile.mockResolvedValueOnce(JSON.stringify(conv));
      // saveConversation reads index (safeReadJSON) for new fork
      mockSafeReadJSON.mockResolvedValueOnce([]);

      await forkConversation('fk-1', 4, { newId: 'fk-1-child' });

      // 원본 id 파일로의 atomic 쓰기는 없어야 함
      const originalWrite = mockAtomicWriteJSON.mock.calls.find(
        (call: unknown[]) => (call[0] as string).includes('fk-1.json')
            && !(call[0] as string).includes('fk-1-child.json')
      );
      expect(originalWrite).toBeUndefined();
    });

    it('새 대화 id가 반환되고 messages가 inclusive slice로 복사된다', async () => {
      const conv = buildConv('fk-2', 10);
      mockFs.readFile.mockResolvedValueOnce(JSON.stringify(conv));
      mockSafeReadJSON.mockResolvedValueOnce([]);

      const result = await forkConversation('fk-2', 3, { newId: 'fk-2-child' });

      expect(result.id).toBe('fk-2-child');
      expect(result.messages).toHaveLength(4);
      expect(result.messages[3].id).toBe('m3');
    });

    it('newId 미지정 시 uuid를 자동 생성한다', async () => {
      const conv = buildConv('fk-auto', 5);
      mockFs.readFile.mockResolvedValueOnce(JSON.stringify(conv));
      mockSafeReadJSON.mockResolvedValueOnce([]);

      const result = await forkConversation('fk-auto', 1);

      expect(result.id).toBeDefined();
      expect(result.id).not.toBe('fk-auto');
      expect(result.id.length).toBeGreaterThan(0);
    });

    it('새 대화의 forkedFrom에 원본 id/messageIndex/forkedAt을 기록한다', async () => {
      const conv = buildConv('fk-3', 6);
      mockFs.readFile.mockResolvedValueOnce(JSON.stringify(conv));
      mockSafeReadJSON.mockResolvedValueOnce([]);

      const before = Date.now();
      const result = await forkConversation('fk-3', 2, { newId: 'fk-3-child' });
      const after = Date.now();

      expect(result.forkedFrom).toBeDefined();
      expect(result.forkedFrom!.conversationId).toBe('fk-3');
      expect(result.forkedFrom!.messageIndex).toBe(2);
      expect(result.forkedFrom!.forkedAt).toBeGreaterThanOrEqual(before);
      expect(result.forkedFrom!.forkedAt).toBeLessThanOrEqual(after);
    });

    it('옵션 title이 새 대화 제목으로 사용된다', async () => {
      const conv = buildConv('fk-4', 4);
      mockFs.readFile.mockResolvedValueOnce(JSON.stringify(conv));
      mockSafeReadJSON.mockResolvedValueOnce([]);

      const result = await forkConversation('fk-4', 1, {
        newId: 'fk-4-child',
        title: '사용자 정의 포크 제목',
      });

      expect(result.title).toBe('사용자 정의 포크 제목');
    });

    it('title 미지정 시 "원본제목 (분기)" 형태로 생성한다', async () => {
      const conv = buildConv('fk-5', 3);
      mockFs.readFile.mockResolvedValueOnce(JSON.stringify(conv));
      mockSafeReadJSON.mockResolvedValueOnce([]);

      const result = await forkConversation('fk-5', 0, { newId: 'fk-5-child' });

      expect(result.title).toBe('Fork Source (분기)');
    });

    it('존재하지 않는 원본 id이면 에러를 throw한다', async () => {
      // getConversation returns null when fs.readFile fails
      mockFs.readFile.mockRejectedValueOnce(new Error('ENOENT'));

      await expect(forkConversation('fk-missing', 0)).rejects.toThrow(/not found/);
    });

    it('음수 messageIndex를 거부한다', async () => {
      await expect(forkConversation('fk-neg', -1)).rejects.toThrow(/Invalid messageIndex/);
    });

    it('비정수 messageIndex를 거부한다', async () => {
      await expect(forkConversation('fk-frac', 0.25)).rejects.toThrow(/Invalid messageIndex/);
    });

    it('messages.length 이상의 messageIndex를 거부한다', async () => {
      const conv = buildConv('fk-out', 3);
      mockFs.readFile.mockResolvedValueOnce(JSON.stringify(conv));

      await expect(
        forkConversation('fk-out', 3, { newId: 'fk-out-child' })
      ).rejects.toThrow(/messageIndex/);
    });

    it('tags가 깊은 복사로 복제되어 원본 배열과 독립된다', async () => {
      const conv = {
        ...buildConv('fk-tags', 3),
        tags: ['original', 'keep'],
      };
      mockFs.readFile.mockResolvedValueOnce(JSON.stringify(conv));
      mockSafeReadJSON.mockResolvedValueOnce([]);

      const result = await forkConversation('fk-tags', 0, { newId: 'fk-tags-child' });

      expect(result.tags).toEqual(['original', 'keep']);
      // mutating result.tags must not affect source
      result.tags!.push('mutated');
      expect(conv.tags).toEqual(['original', 'keep']);
    });

    it('folderId가 원본에 있으면 새 대화에도 복사한다', async () => {
      const conv = {
        ...buildConv('fk-folder', 3),
        folderId: 'folder-xyz',
      };
      mockFs.readFile.mockResolvedValueOnce(JSON.stringify(conv));
      mockSafeReadJSON.mockResolvedValueOnce([]);

      const result = await forkConversation('fk-folder', 1, { newId: 'fk-folder-child' });

      expect(result.folderId).toBe('folder-xyz');
    });
  });
});
