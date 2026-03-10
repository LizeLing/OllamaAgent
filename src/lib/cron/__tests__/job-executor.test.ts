import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CronJob } from '@/types/cron';

vi.mock('@/lib/config/settings', () => ({
  loadSettings: vi.fn(() => ({
    ollamaUrl: 'http://localhost:11434',
    ollamaModel: 'llama3',
    systemPrompt: '',
    allowedPaths: [],
    deniedPaths: [],
    searxngUrl: '',
    imageModel: '',
    modelOptions: {},
    fallbackModels: [],
    embeddingModel: 'nomic-embed-text',
  })),
}));

vi.mock('@/lib/tools/init', () => ({
  initializeTools: vi.fn(),
}));

vi.mock('@/lib/agent/agent-loop', () => ({
  runAgentLoop: vi.fn(),
}));

vi.mock('@/lib/memory/memory-manager', () => ({
  MemoryManager: class MockMemoryManager {
    purgeOld = vi.fn().mockResolvedValue(5);
  },
}));

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import { CronJobExecutor } from '../job-executor';
import { runAgentLoop } from '@/lib/agent/agent-loop';

const baseJob = (overrides: Partial<CronJob> = {}): CronJob => ({
  id: `test-job-${Math.random().toString(36).slice(2, 8)}`,
  name: '테스트',
  cronExpression: '* * * * *',
  jobType: 'health_check',
  jobConfig: {},
  enabled: true,
  createdAt: Date.now(),
  runCount: 0,
  ...overrides,
});

describe('CronJobExecutor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('이미 실행 중인 작업은 에러를 반환한다', async () => {
    let resolveFirst: () => void;
    const blockingPromise = new Promise<void>((r) => { resolveFirst = r; });

    mockFetch.mockImplementation(() => blockingPromise.then(() => ({
      ok: true,
      json: () => Promise.resolve({ status: 'ok' }),
    })));

    const job = baseJob({ id: 'duplicate-check', jobType: 'health_check' });
    const promise1 = CronJobExecutor.executeJob(job);

    // 같은 작업 재실행 시도
    const result2 = await CronJobExecutor.executeJob(job);
    expect(result2.success).toBe(false);
    expect(result2.error).toBe('Job already running');

    // 첫 번째 작업 해제
    resolveFirst!();
    await promise1;
  });

  describe('health_check', () => {
    it('성공적인 건강 체크를 처리한다', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ status: 'ok' }),
      });

      const job = baseJob({ jobType: 'health_check', jobConfig: {} });
      const result = await CronJobExecutor.executeJob(job);

      expect(result.success).toBe(true);
      expect(result.output).toContain('Health check: OK');
    });

    it('실패한 건강 체크를 처리한다', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        json: () => Promise.resolve({ status: 'error' }),
      });

      const job = baseJob({ jobType: 'health_check', jobConfig: {} });
      const result = await CronJobExecutor.executeJob(job);

      expect(result.success).toBe(true);
      expect(result.output).toContain('Health check: FAIL');
    });

    it('실패 시 notifyUrl로 알림을 보낸다', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          json: () => Promise.resolve({ status: 'error' }),
        })
        .mockResolvedValueOnce({ ok: true });

      const job = baseJob({
        jobType: 'health_check',
        jobConfig: { notifyUrl: 'https://notify.example.com' },
      });
      const result = await CronJobExecutor.executeJob(job);

      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(mockFetch).toHaveBeenLastCalledWith(
        'https://notify.example.com',
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('네트워크 오류를 처리한다', async () => {
      mockFetch.mockRejectedValue(new Error('Connection refused'));

      const job = baseJob({ jobType: 'health_check', jobConfig: {} });
      const result = await CronJobExecutor.executeJob(job);

      expect(result.success).toBe(true);
      expect(result.output).toContain('Health check failed');
      expect(result.output).toContain('Connection refused');
    });
  });

  describe('http_request', () => {
    it('HTTP 요청을 실행한다', async () => {
      mockFetch.mockResolvedValue({
        status: 200,
        text: () => Promise.resolve('response body'),
      });

      const job = baseJob({
        jobType: 'http_request',
        jobConfig: { url: 'https://example.com/api', method: 'GET' },
      });
      const result = await CronJobExecutor.executeJob(job);

      expect(result.success).toBe(true);
      expect(result.output).toContain('Status: 200');
      expect(result.output).toContain('response body');
    });

    it('POST 요청의 body를 전달한다', async () => {
      mockFetch.mockResolvedValue({
        status: 201,
        text: () => Promise.resolve('created'),
      });

      const job = baseJob({
        jobType: 'http_request',
        jobConfig: {
          url: 'https://example.com/api',
          method: 'POST',
          body: '{"key":"value"}',
          headers: { 'Content-Type': 'application/json' },
        },
      });
      await CronJobExecutor.executeJob(job);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com/api',
        expect.objectContaining({
          method: 'POST',
          body: '{"key":"value"}',
          headers: { 'Content-Type': 'application/json' },
        })
      );
    });

    it('GET 요청에는 body를 포함하지 않는다', async () => {
      mockFetch.mockResolvedValue({
        status: 200,
        text: () => Promise.resolve('ok'),
      });

      const job = baseJob({
        jobType: 'http_request',
        jobConfig: { url: 'https://example.com', method: 'GET' },
      });
      await CronJobExecutor.executeJob(job);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com',
        expect.objectContaining({ method: 'GET', body: undefined })
      );
    });

    it('HTTP 오류 시 실패 결과를 반환한다', async () => {
      mockFetch.mockRejectedValue(new Error('Timeout'));

      const job = baseJob({
        jobType: 'http_request',
        jobConfig: { url: 'https://example.com', method: 'GET' },
      });
      const result = await CronJobExecutor.executeJob(job);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Timeout');
    });
  });

  describe('agent_run', () => {
    it('에이전트를 실행하고 결과를 수집한다', async () => {
      async function* mockGenerator() {
        yield { type: 'token', data: { content: '안녕' } };
        yield { type: 'token', data: { content: '하세요' } };
        yield { type: 'done', data: {} };
      }
      vi.mocked(runAgentLoop).mockReturnValue(mockGenerator() as never);

      const job = baseJob({
        jobType: 'agent_run',
        jobConfig: { prompt: '테스트 프롬프트' },
      });
      const result = await CronJobExecutor.executeJob(job);

      expect(result.success).toBe(true);
      expect(result.output).toBe('안녕하세요');
    });

    it('token이 아닌 이벤트는 무시한다', async () => {
      async function* mockGenerator() {
        yield { type: 'thinking_token', data: { content: '생각중' } };
        yield { type: 'token', data: { content: '결과' } };
        yield { type: 'tool_start', data: { name: 'test' } };
      }
      vi.mocked(runAgentLoop).mockReturnValue(mockGenerator() as never);

      const job = baseJob({
        jobType: 'agent_run',
        jobConfig: { prompt: 'test' },
      });
      const result = await CronJobExecutor.executeJob(job);

      expect(result.output).toBe('결과');
    });
  });

  describe('memory_cleanup', () => {
    it('메모리 정리를 실행한다', async () => {
      const job = baseJob({
        jobType: 'memory_cleanup',
        jobConfig: { maxAgeDays: 30, maxCount: 1000 },
      });
      const result = await CronJobExecutor.executeJob(job);

      expect(result.success).toBe(true);
      expect(result.output).toContain('5개의 오래된 메모리가 정리되었습니다');
    });
  });

  it('output을 2000자로 제한한다', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: 'x'.repeat(3000) }),
    });

    const job = baseJob({ jobType: 'health_check', jobConfig: {} });
    const result = await CronJobExecutor.executeJob(job);

    expect(result.success).toBe(true);
    expect(result.output!.length).toBeLessThanOrEqual(2000);
  });
});
