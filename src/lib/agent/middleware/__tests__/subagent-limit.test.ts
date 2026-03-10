import { describe, it, expect, vi } from 'vitest';
import { SubagentLimitMiddleware } from '../subagent-limit';
import type { MiddlewareContext, ToolCallInfo } from '../types';

function makeCtx(): MiddlewareContext {
  return {
    config: {
      ollamaUrl: '',
      ollamaModel: '',
      maxIterations: 10,
      systemPrompt: '',
      allowedPaths: [],
      deniedPaths: [],
    },
    messages: [],
    userMessage: '',
    history: [],
    memories: [],
    metadata: {},
  };
}

describe('SubagentLimitMiddleware', () => {
  it('name이 subagent-limit이다', () => {
    const mw = new SubagentLimitMiddleware();
    expect(mw.name).toBe('subagent-limit');
  });

  it('기본 maxConcurrent는 3이다', async () => {
    const mw = new SubagentLimitMiddleware();
    const calls: ToolCallInfo[] = [
      { name: 'delegate_to_subagent', arguments: { type: 'coder', task: 't1' } },
      { name: 'delegate_to_subagent', arguments: { type: 'researcher', task: 't2' } },
      { name: 'delegate_to_subagent', arguments: { type: 'analyst', task: 't3' } },
    ];
    const result = await mw.afterModel!(makeCtx(), calls);
    expect(result).toHaveLength(3);
  });

  it('delegate_to_subagent 호출이 maxConcurrent 이하면 통과', async () => {
    const mw = new SubagentLimitMiddleware(3);
    const calls: ToolCallInfo[] = [
      { name: 'delegate_to_subagent', arguments: { type: 'coder', task: 't1' } },
      { name: 'delegate_to_subagent', arguments: { type: 'researcher', task: 't2' } },
    ];
    const result = await mw.afterModel!(makeCtx(), calls);
    expect(result).toHaveLength(2);
  });

  it('delegate_to_subagent 호출이 maxConcurrent 초과 시 잘린다', async () => {
    const mw = new SubagentLimitMiddleware(2);
    const calls: ToolCallInfo[] = [
      { name: 'delegate_to_subagent', arguments: { type: 'coder', task: 't1' } },
      { name: 'delegate_to_subagent', arguments: { type: 'researcher', task: 't2' } },
      { name: 'delegate_to_subagent', arguments: { type: 'analyst', task: 't3' } },
      { name: 'filesystem_read', arguments: { path: '/test' } },
    ];
    const result = await mw.afterModel!(makeCtx(), calls);
    const subagentCalls = result.filter(
      (c) => c.name === 'delegate_to_subagent'
    );
    expect(subagentCalls).toHaveLength(2);
    // 비-서브에이전트 호출은 유지
    expect(result.find((c) => c.name === 'filesystem_read')).toBeDefined();
  });

  it('서브에이전트 호출이 없으면 그대로 반환', async () => {
    const mw = new SubagentLimitMiddleware(2);
    const calls: ToolCallInfo[] = [
      { name: 'filesystem_read', arguments: { path: '/a' } },
      { name: 'web_search', arguments: { query: 'test' } },
    ];
    const result = await mw.afterModel!(makeCtx(), calls);
    expect(result).toHaveLength(2);
    expect(result).toEqual(calls);
  });

  it('제한 시 로그가 출력된다', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const mw = new SubagentLimitMiddleware(1);
    const calls: ToolCallInfo[] = [
      { name: 'delegate_to_subagent', arguments: { type: 'coder', task: 't1' } },
      { name: 'delegate_to_subagent', arguments: { type: 'researcher', task: 't2' } },
      { name: 'delegate_to_subagent', arguments: { type: 'analyst', task: 't3' } },
    ];
    await mw.afterModel!(makeCtx(), calls);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('서브에이전트 호출 제한: 3 → 1')
    );
    consoleSpy.mockRestore();
  });

  it('일반 도구와 서브에이전트가 혼합된 경우 올바르게 분리', async () => {
    const mw = new SubagentLimitMiddleware(1);
    const calls: ToolCallInfo[] = [
      { name: 'filesystem_read', arguments: { path: '/a' } },
      { name: 'delegate_to_subagent', arguments: { type: 'coder', task: 't1' } },
      { name: 'web_search', arguments: { query: 'test' } },
      { name: 'delegate_to_subagent', arguments: { type: 'researcher', task: 't2' } },
    ];
    const result = await mw.afterModel!(makeCtx(), calls);
    // otherCalls(2) + subagentCalls(1) = 3
    expect(result).toHaveLength(3);
    const subagentCalls = result.filter(
      (c) => c.name === 'delegate_to_subagent'
    );
    expect(subagentCalls).toHaveLength(1);
    const otherCalls = result.filter(
      (c) => c.name !== 'delegate_to_subagent'
    );
    expect(otherCalls).toHaveLength(2);
  });
});
