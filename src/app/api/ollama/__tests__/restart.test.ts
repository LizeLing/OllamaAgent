import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/config/settings', () => ({
  loadSettings: vi.fn(() =>
    Promise.resolve({
      ollamaUrl: 'http://localhost:11434',
      numParallel: 2,
      maxLoadedModels: 3,
    }),
  ),
}));

vi.mock('@/lib/ollama/process', () => ({
  killOllama: vi.fn(),
  startOllama: vi.fn(),
}));

import { POST } from '../restart/route';
import { loadSettings } from '@/lib/config/settings';
import { killOllama, startOllama } from '@/lib/ollama/process';

beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = vi.fn().mockResolvedValue({ ok: true });
});

describe('POST /api/ollama/restart', () => {
  it('Ollama 프로세스를 종료하고 새로 시작한다', async () => {
    const res = await POST();
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.numParallel).toBe(2);
    expect(data.maxLoadedModels).toBe(3);

    expect(killOllama).toHaveBeenCalled();
    expect(startOllama).toHaveBeenCalledWith(expect.objectContaining({
      OLLAMA_NUM_PARALLEL: '2',
      OLLAMA_MAX_LOADED_MODELS: '3',
    }));
  });

  it('killOllama 실패해도 정상 진행한다', async () => {
    vi.mocked(killOllama).mockImplementation(() => { throw new Error('no process'); });

    const res = await POST();
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(startOllama).toHaveBeenCalled();
  });

  it('설정의 기본값을 사용한다', async () => {
    vi.mocked(loadSettings).mockResolvedValueOnce({
      ollamaUrl: 'http://localhost:11434',
    } as Awaited<ReturnType<typeof loadSettings>>);

    const res = await POST();
    const data = await res.json();

    expect(data.numParallel).toBe(1);
    expect(data.maxLoadedModels).toBe(1);
  });

  it('Ollama가 응답하지 않으면 503을 반환한다', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('connection refused'));

    const res = await POST();

    expect(res.status).toBe(503);
    const data = await res.json();
    expect(data.error).toContain('응답하지 않습니다');
  }, 15000);
});
