import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/config/settings', () => ({
  loadSettings: vi.fn(() =>
    Promise.resolve({
      ollamaUrl: 'http://localhost:11434',
      numParallel: 4,
      maxLoadedModels: 2,
    }),
  ),
}));

import { GET } from '../status/route';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/ollama/status', () => {
  it('Ollama가 실행 중이면 running: true와 설정값을 반환한다', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true });

    const res = await GET();
    const data = await res.json();

    expect(data.running).toBe(true);
    expect(data.numParallel).toBe(4);
    expect(data.maxLoadedModels).toBe(2);
  });

  it('Ollama가 응답하지 않으면 running: false를 반환한다', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('connection refused'));

    const res = await GET();
    const data = await res.json();

    expect(data.running).toBe(false);
  });

  it('Ollama가 비정상 응답이면 running: false를 반환한다', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false });

    const res = await GET();
    const data = await res.json();

    expect(data.running).toBe(false);
  });
});
