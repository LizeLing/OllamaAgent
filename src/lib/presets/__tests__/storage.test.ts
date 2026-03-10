import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFs = {
  readFile: vi.fn(),
  writeFile: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined),
  readdir: vi.fn().mockResolvedValue([]),
  unlink: vi.fn().mockResolvedValue(undefined),
};

vi.mock('fs/promises', () => ({
  default: mockFs,
}));

const mockAtomicWriteJSON = vi.fn().mockResolvedValue(undefined);
vi.mock('@/lib/storage/atomic-write', () => ({
  atomicWriteJSON: (...args: unknown[]) => mockAtomicWriteJSON(...args),
  safeReadJSON: vi.fn().mockResolvedValue({}),
}));

vi.mock('@/lib/config/constants', () => ({
  DATA_DIR: '/tmp/test-data',
}));

vi.mock('../defaults', () => ({
  DEFAULT_PRESETS: [
    { id: 'coding', name: '코딩', systemPrompt: 'coding prompt', enabledTools: ['code_execute'] },
    { id: 'research', name: '리서치', systemPrompt: 'research prompt', enabledTools: ['web_search'] },
    { id: 'general', name: '일반', systemPrompt: 'general prompt', enabledTools: [] },
  ],
}));

describe('Preset Storage', () => {
  let listPresets: typeof import('../storage').listPresets;
  let getPreset: typeof import('../storage').getPreset;
  let savePreset: typeof import('../storage').savePreset;
  let deletePreset: typeof import('../storage').deletePreset;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    mockFs.readFile.mockRejectedValue(new Error('not found'));
    mockFs.readdir.mockResolvedValue([]);
    mockFs.writeFile.mockResolvedValue(undefined);
    mockFs.mkdir.mockResolvedValue(undefined);
    mockFs.unlink.mockResolvedValue(undefined);

    const mod = await import('../storage');
    listPresets = mod.listPresets;
    getPreset = mod.getPreset;
    savePreset = mod.savePreset;
    deletePreset = mod.deletePreset;
  });

  it('listPresets: 기본 + 사용자 정의 프리셋을 반환한다', async () => {
    mockFs.readdir.mockResolvedValueOnce(['custom1.json']);
    mockFs.readFile.mockResolvedValueOnce(JSON.stringify({
      id: 'custom1', name: 'Custom', systemPrompt: 'custom', enabledTools: [],
    }));

    const presets = await listPresets();

    expect(presets.length).toBe(4); // 3 defaults + 1 custom
    expect(presets[3].id).toBe('custom1');
  });

  it('getPreset: 기본 프리셋을 id로 찾는다', async () => {
    const preset = await getPreset('coding');

    expect(preset).not.toBeNull();
    expect(preset!.name).toBe('코딩');
  });

  it('getPreset: 사용자 정의 프리셋을 id로 찾는다', async () => {
    mockFs.readFile.mockResolvedValueOnce(JSON.stringify({
      id: 'my-preset', name: 'My Preset', systemPrompt: 'my prompt', enabledTools: [],
    }));

    const preset = await getPreset('my-preset');

    expect(preset).not.toBeNull();
    expect(preset!.name).toBe('My Preset');
  });

  it('savePreset: 파일에 저장한다', async () => {
    await savePreset({
      id: 'new-preset',
      name: 'New',
      systemPrompt: 'prompt',
      enabledTools: ['filesystem_read'],
    });

    expect(mockAtomicWriteJSON).toHaveBeenCalledWith(
      expect.stringContaining('new-preset.json'),
      expect.objectContaining({ id: 'new-preset', name: 'New' })
    );
  });

  it('deletePreset: 기본 프리셋은 삭제할 수 없다', async () => {
    const result = await deletePreset('coding');
    expect(result).toBe(false);
  });

  it('deletePreset: 사용자 정의 프리셋을 삭제한다', async () => {
    const result = await deletePreset('custom1');
    expect(result).toBe(true);
    expect(mockFs.unlink).toHaveBeenCalledWith(expect.stringContaining('custom1.json'));
  });

  it('getPreset: 존재하지 않는 id면 null을 반환한다', async () => {
    mockFs.readFile.mockRejectedValueOnce(new Error('not found'));

    const preset = await getPreset('nonexistent');
    expect(preset).toBeNull();
  });

  it('savePreset: 잘못된 ID를 거부한다', async () => {
    await expect(savePreset({
      id: '../bad id',
      name: 'Bad',
      systemPrompt: 'x',
      enabledTools: [],
    })).rejects.toThrow('Invalid ID');
  });
});
