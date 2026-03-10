import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock atomic-write module (folders.ts uses safeReadJSON and atomicWriteJSON)
const mockAtomicWriteJSON = vi.fn().mockResolvedValue(undefined);
const mockSafeReadJSON = vi.fn();

vi.mock('@/lib/storage/atomic-write', () => ({
  atomicWriteJSON: mockAtomicWriteJSON,
  safeReadJSON: mockSafeReadJSON,
}));

vi.mock('@/lib/config/constants', () => ({
  DATA_DIR: '/tmp/test-data',
}));

describe('Folder Storage', () => {
  let listFolders: typeof import('../folders').listFolders;
  let createFolder: typeof import('../folders').createFolder;
  let updateFolder: typeof import('../folders').updateFolder;
  let deleteFolder: typeof import('../folders').deleteFolder;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    // safeReadJSON returns default value (empty array) when file not found
    mockSafeReadJSON.mockResolvedValue([]);
    mockAtomicWriteJSON.mockResolvedValue(undefined);

    const mod = await import('../folders');
    listFolders = mod.listFolders;
    createFolder = mod.createFolder;
    updateFolder = mod.updateFolder;
    deleteFolder = mod.deleteFolder;
  });

  it('listFolders: order 기준으로 정렬하여 반환한다', async () => {
    const folders = [
      { id: 'f2', name: 'B', color: '#red', order: 2 },
      { id: 'f1', name: 'A', color: '#blue', order: 1 },
      { id: 'f3', name: 'C', color: '#green', order: 0 },
    ];
    mockSafeReadJSON.mockResolvedValueOnce(folders);

    const result = await listFolders();

    expect(result[0].id).toBe('f3');
    expect(result[1].id).toBe('f1');
    expect(result[2].id).toBe('f2');
  });

  it('createFolder: 자동 order를 할당하고 id를 생성한다', async () => {
    const existingFolders = [
      { id: 'f1', name: 'Existing', color: '#red', order: 0 },
    ];
    mockSafeReadJSON.mockResolvedValueOnce(existingFolders);

    const result = await createFolder('New Folder', '#blue');

    expect(result.name).toBe('New Folder');
    expect(result.color).toBe('#blue');
    expect(result.order).toBe(1); // existing length
    expect(result.id).toMatch(/^folder-/);
    expect(mockAtomicWriteJSON).toHaveBeenCalled();
  });

  it('updateFolder: 속성을 업데이트하고 id를 보존한다', async () => {
    const folders = [
      { id: 'f1', name: 'Old Name', color: '#red', order: 0 },
    ];
    mockSafeReadJSON.mockResolvedValueOnce(folders);

    const result = await updateFolder('f1', { name: 'New Name', color: '#green' });

    expect(result).not.toBeNull();
    expect(result!.name).toBe('New Name');
    expect(result!.color).toBe('#green');
    expect(result!.id).toBe('f1'); // preserved
  });

  it('updateFolder: 존재하지 않는 id면 null을 반환한다', async () => {
    mockSafeReadJSON.mockResolvedValueOnce([]);

    const result = await updateFolder('nonexistent', { name: 'X' });
    expect(result).toBeNull();
  });

  it('deleteFolder: 폴더를 필터링하여 제거한다', async () => {
    const folders = [
      { id: 'f1', name: 'A', color: '#red', order: 0 },
      { id: 'f2', name: 'B', color: '#blue', order: 1 },
    ];
    mockSafeReadJSON.mockResolvedValueOnce(folders);

    await deleteFolder('f1');

    const writeCall = mockAtomicWriteJSON.mock.calls[0];
    // atomicWriteJSON receives the object directly (not JSON string)
    const written = writeCall[1] as Array<{ id: string }>;
    expect(written).toHaveLength(1);
    expect(written[0].id).toBe('f2');
  });

  it('빈 폴더 파일에서 빈 배열을 반환한다', async () => {
    // safeReadJSON returns default value [] when file not found
    mockSafeReadJSON.mockResolvedValueOnce([]);

    const result = await listFolders();
    expect(result).toEqual([]);
  });

  it('createFolder: 빈 상태에서 order 0으로 생성한다', async () => {
    // safeReadJSON returns default value [] when file not found
    mockSafeReadJSON.mockResolvedValueOnce([]);

    const result = await createFolder('First', '#red');

    expect(result.order).toBe(0);
  });

  it('deleteFolder: 존재하지 않는 id는 무시한다', async () => {
    const folders = [{ id: 'f1', name: 'A', color: '#red', order: 0 }];
    mockSafeReadJSON.mockResolvedValueOnce(folders);

    await deleteFolder('nonexistent');

    const writeCall = mockAtomicWriteJSON.mock.calls[0];
    // atomicWriteJSON receives the object directly (not JSON string)
    const written = writeCall[1] as Array<{ id: string }>;
    expect(written).toHaveLength(1);
  });
});
