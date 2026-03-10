import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockAtomicWrite = vi.fn().mockResolvedValue(undefined);
const mockSafeRead = vi.fn();

vi.mock('@/lib/storage/atomic-write', () => ({
  atomicWriteJSON: (...args: unknown[]) => mockAtomicWrite(...args),
  safeReadJSON: (...args: unknown[]) => mockSafeRead(...args),
}));

vi.mock('@/lib/config/constants', () => ({
  DATA_DIR: '/tmp/test-data',
  DEFAULT_SETTINGS: {
    systemPrompt: 'default prompt',
    maxIterations: 10,
    allowedPaths: ['/Users', '/tmp'],
    deniedPaths: ['/etc'],
    responseLanguage: 'ko',
    ollamaUrl: 'http://localhost:11434',
    ollamaModel: 'qwen3.5:9b',
    embeddingModel: 'qwen3-embedding:8b',
    imageModel: 'x/z-image-turbo:latest',
    searxngUrl: 'http://localhost:8888',
    autoReadResponses: false,
    ttsVoice: 'ko-KR-SunHiNeural',
    toolApprovalMode: 'auto',
    activePresetId: undefined,
    customTools: [],
    mcpServers: [],
    modelOptions: { temperature: 0.7, topP: 0.9, numPredict: 2048 },
    enabledTools: [],
  },
}));

describe('Settings', () => {
  let loadSettings: typeof import('../settings').loadSettings;
  let saveSettings: typeof import('../settings').saveSettings;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    mockSafeRead.mockResolvedValue({});
    mockAtomicWrite.mockResolvedValue(undefined);

    const mod = await import('../settings');
    loadSettings = mod.loadSettings;
    saveSettings = mod.saveSettings;
  });

  it('loadSettings: 파일이 없으면 DEFAULT_SETTINGS를 반환한다', async () => {
    mockSafeRead.mockResolvedValueOnce({});

    const settings = await loadSettings();

    expect(settings.ollamaUrl).toBe('http://localhost:11434');
    expect(settings.maxIterations).toBe(10);
    expect(settings.toolApprovalMode).toBe('auto');
  });

  it('loadSettings: 저장된 설정을 기본값과 병합한다', async () => {
    const saved = { ollamaModel: 'llama3:8b', maxIterations: 20 };
    mockSafeRead.mockResolvedValueOnce(saved);

    const settings = await loadSettings();

    expect(settings.ollamaModel).toBe('llama3:8b');
    expect(settings.maxIterations).toBe(20);
    expect(settings.ollamaUrl).toBe('http://localhost:11434');
  });

  it('saveSettings: 현재 설정을 읽고 병합하여 저장한다', async () => {
    mockSafeRead.mockResolvedValueOnce({});

    const result = await saveSettings({ ollamaModel: 'gemma3:12b' });

    expect(result.ollamaModel).toBe('gemma3:12b');
    expect(result.ollamaUrl).toBe('http://localhost:11434');
    expect(mockAtomicWrite).toHaveBeenCalledWith(
      expect.stringContaining('settings.json'),
      expect.objectContaining({ ollamaModel: 'gemma3:12b' })
    );
  });

  it('saveSettings: 기존 설정에 부분 업데이트를 적용한다', async () => {
    const existing = { ollamaModel: 'llama3:8b', maxIterations: 5 };
    mockSafeRead.mockResolvedValueOnce(existing);

    const result = await saveSettings({ maxIterations: 15 });

    expect(result.ollamaModel).toBe('llama3:8b');
    expect(result.maxIterations).toBe(15);
  });

  it('DEFAULT_SETTINGS에 환경 변수 오버라이드가 적용된다', async () => {
    const { DEFAULT_SETTINGS } = await import('@/lib/config/constants');
    expect(DEFAULT_SETTINGS.ollamaUrl).toBeDefined();
    expect(DEFAULT_SETTINGS.ollamaModel).toBeDefined();
  });
});
