import { describe, it, expect, vi } from 'vitest';
import { MiddlewareChain } from '../chain';
import { AgentMiddleware, MiddlewareContext } from '../types';

function makeCtx(overrides?: Partial<MiddlewareContext>): MiddlewareContext {
  return {
    config: { ollamaUrl: '', ollamaModel: '', maxIterations: 10, systemPrompt: '', allowedPaths: [], deniedPaths: [] },
    messages: [],
    userMessage: 'test',
    history: [],
    memories: [],
    metadata: {},
    ...overrides,
  };
}

describe('MiddlewareChain', () => {
  it('beforeAgent를 순서대로 실행한다', async () => {
    const order: string[] = [];
    const mw1: AgentMiddleware = {
      name: 'mw1',
      async beforeAgent(ctx) { order.push('mw1'); return ctx; },
    };
    const mw2: AgentMiddleware = {
      name: 'mw2',
      async beforeAgent(ctx) { order.push('mw2'); return ctx; },
    };
    const chain = new MiddlewareChain([mw1, mw2]);
    await chain.runBeforeAgent(makeCtx());
    expect(order).toEqual(['mw1', 'mw2']);
  });

  it('beforeAgent에서 ctx를 수정하면 다음 미들웨어에 전달된다', async () => {
    const mw: AgentMiddleware = {
      name: 'injector',
      async beforeAgent(ctx) {
        return { ...ctx, metadata: { ...ctx.metadata, injected: true } };
      },
    };
    const chain = new MiddlewareChain([mw]);
    const result = await chain.runBeforeAgent(makeCtx());
    expect(result.metadata.injected).toBe(true);
  });

  it('afterModel에서 toolCalls를 수정할 수 있다', async () => {
    const mw: AgentMiddleware = {
      name: 'limiter',
      async afterModel(_ctx, toolCalls) {
        return toolCalls.slice(0, 2);
      },
    };
    const chain = new MiddlewareChain([mw]);
    const calls = [
      { name: 't1', arguments: {} },
      { name: 't2', arguments: {} },
      { name: 't3', arguments: {} },
    ];
    const result = await chain.runAfterModel(makeCtx(), calls);
    expect(result).toHaveLength(2);
  });

  it('미들웨어 없이도 동작한다', async () => {
    const chain = new MiddlewareChain([]);
    const ctx = makeCtx();
    const result = await chain.runBeforeAgent(ctx);
    expect(result).toEqual(ctx);
  });

  it('미들웨어 에러 시 로그 후 계속 진행한다', async () => {
    const mw: AgentMiddleware = {
      name: 'broken',
      async beforeAgent() { throw new Error('fail'); },
    };
    const chain = new MiddlewareChain([mw]);
    const result = await chain.runBeforeAgent(makeCtx());
    expect(result).toBeDefined();
  });
});
