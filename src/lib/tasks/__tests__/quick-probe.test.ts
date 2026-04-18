import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runQuickProbe } from '@/lib/tasks/quick-probe';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('runQuickProbe', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns success when warmup and concurrent probe requests succeed', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ done: true, load_duration: 0, message: { role: 'assistant', content: 'OK' } })
      )
      .mockResolvedValueOnce(
        jsonResponse({ done: true, load_duration: 20_000_000, message: { role: 'assistant', content: 'OK' } })
      )
      .mockResolvedValueOnce(
        jsonResponse({ done: true, load_duration: 10_000_000, message: { role: 'assistant', content: 'OK' } })
      );

    vi.stubGlobal('fetch', fetchMock);

    const result = await runQuickProbe({
      baseUrl: 'http://localhost:11434',
      model: 'qwen3.5:9b',
      numCtx: 4096,
      workloadType: 'mixed-task-mode',
      candidateNumParallel: 2,
      timeoutMs: 500,
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result.ok).toBe(true);
    expect(result.successfulRequests).toBe(2);
    expect(result.failedRequests).toBe(0);
    expect(result.warmLoad).toBe(true);
  });

  it('returns failure when one concurrent request fails', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ done: true, load_duration: 0, message: { role: 'assistant', content: 'OK' } })
      )
      .mockResolvedValueOnce(jsonResponse({ error: 'busy' }, 503))
      .mockResolvedValueOnce(
        jsonResponse({ done: true, load_duration: 10_000_000, message: { role: 'assistant', content: 'OK' } })
      );

    vi.stubGlobal('fetch', fetchMock);

    const result = await runQuickProbe({
      baseUrl: 'http://localhost:11434',
      model: 'qwen3.5:9b',
      numCtx: 4096,
      workloadType: 'worker-agent',
      candidateNumParallel: 2,
      timeoutMs: 500,
    });

    expect(result.ok).toBe(false);
    expect(result.failedRequests).toBe(1);
    expect(result.reason).toBe('http_503');
  });
});
