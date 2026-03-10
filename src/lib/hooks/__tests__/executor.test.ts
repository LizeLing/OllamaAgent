import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock storage
vi.mock('../storage', () => ({
  getHooksByTrigger: vi.fn(),
  updateHook: vi.fn().mockResolvedValue(null),
}));

// Mock log
vi.mock('../log', () => ({
  appendHookLog: vi.fn().mockResolvedValue(undefined),
}));

// Mock fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import { HookExecutor } from '../executor';
import { getHooksByTrigger } from '../storage';
import { EventHook } from '@/types/hooks';

function makeHook(overrides: Partial<EventHook> = {}): EventHook {
  return {
    id: 'test-hook',
    name: 'Test Hook',
    trigger: 'on_message_received',
    action: 'webhook',
    actionConfig: { url: 'https://example.com/hook', method: 'POST' },
    enabled: true,
    createdAt: Date.now(),
    triggerCount: 0,
    ...overrides,
  };
}

describe('HookExecutor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('executeHook', () => {
    it('webhook 액션을 실행하고 성공 결과를 반환한다', async () => {
      mockFetch.mockResolvedValue(new Response('ok'));
      const hook = makeHook();

      const result = await HookExecutor.executeHook(hook, { message: 'hello' });

      expect(result.success).toBe(true);
      expect(result.hookId).toBe('test-hook');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com/hook',
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('webhook 실패 시 에러 결과를 반환한다', async () => {
      mockFetch.mockRejectedValue(new Error('network error'));
      const hook = makeHook();

      const result = await HookExecutor.executeHook(hook, { message: 'hello' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('network error');
    });
  });

  describe('fireAndForget', () => {
    it('매칭되는 훅을 실행한다', async () => {
      mockFetch.mockResolvedValue(new Response('ok'));
      const hook = makeHook();
      vi.mocked(getHooksByTrigger).mockResolvedValue([hook]);

      HookExecutor.fireAndForget('on_message_received', { message: 'hello' });

      // fireAndForget는 비동기이므로 약간 대기
      await new Promise((r) => setTimeout(r, 50));

      expect(getHooksByTrigger).toHaveBeenCalledWith('on_message_received');
      expect(mockFetch).toHaveBeenCalled();
    });

    it('필터가 일치하지 않으면 실행하지 않는다', async () => {
      const hook = makeHook({
        filters: [{ field: 'model', operator: 'equals', value: 'gpt-4' }],
      });
      vi.mocked(getHooksByTrigger).mockResolvedValue([hook]);

      HookExecutor.fireAndForget('on_message_received', { model: 'llama3' });

      await new Promise((r) => setTimeout(r, 50));

      expect(mockFetch).not.toHaveBeenCalled();
    });
  });
});
