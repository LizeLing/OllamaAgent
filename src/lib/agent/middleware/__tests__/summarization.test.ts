import { describe, it, expect, vi } from 'vitest';
import { SummarizationMiddleware } from '../summarization';
import type { MiddlewareContext } from '../types';

vi.mock('@/lib/ollama/client', () => ({
  chat: vi.fn().mockResolvedValue({
    message: { content: '[요약] 사용자가 웹 앱 개발에 대해 논의함' },
  }),
}));

function makeCtx(historyLength: number): MiddlewareContext {
  const history = Array.from({ length: historyLength }, (_, i) => ({
    role: i % 2 === 0 ? 'user' : 'assistant',
    content: 'A'.repeat(500),
  }));
  return {
    config: {
      ollamaUrl: 'http://localhost:11434',
      ollamaModel: 'test',
      maxIterations: 10,
      systemPrompt: '',
      allowedPaths: [],
      deniedPaths: [],
    },
    messages: [
      { role: 'system', content: 'sys' },
      ...history.map((h) => ({ role: h.role, content: h.content })),
    ],
    userMessage: 'test',
    history,
    memories: [],
    metadata: {},
  };
}

describe('SummarizationMiddleware', () => {
  it('name이 summarization이다', () => {
    const mw = new SummarizationMiddleware();
    expect(mw.name).toBe('summarization');
  });

  it('임계값 미만이면 변경 없음', async () => {
    const mw = new SummarizationMiddleware(10000);
    const ctx = makeCtx(4); // 2000 chars << 10000
    const result = await mw.beforeAgent(ctx);
    expect(result.messages.length).toBe(ctx.messages.length);
  });

  it('임계값 초과 시 요약으로 압축한다', async () => {
    const mw = new SummarizationMiddleware(1000); // 낮은 임계값
    const ctx = makeCtx(20); // 10000 chars >> 1000
    const result = await mw.beforeAgent(ctx);
    expect(result.messages.length).toBeLessThan(ctx.messages.length);
    const summaryMsg = result.messages.find((m) =>
      m.content.includes('[이전 대화 요약]')
    );
    expect(summaryMsg).toBeDefined();
  });

  it('요약 후 시스템 메시지가 보존된다', async () => {
    const mw = new SummarizationMiddleware(1000);
    const ctx = makeCtx(20);
    const result = await mw.beforeAgent(ctx);
    expect(result.messages[0].role).toBe('system');
    expect(result.messages[0].content).toBe('sys');
  });

  it('요약 후 최근 4개 메시지가 보존된다', async () => {
    const mw = new SummarizationMiddleware(1000);
    const ctx = makeCtx(20);
    const result = await mw.beforeAgent(ctx);
    // systemMsg(1) + summaryMsg(1) + recentMessages(4) = 6
    expect(result.messages.length).toBe(6);
  });

  it('oldMessages가 2개 미만이면 요약하지 않는다', async () => {
    const mw = new SummarizationMiddleware(100); // 매우 낮은 임계값
    // system(1) + 5 messages → slice(1,-4) = 1개 → 2개 미만 → 그대로 반환
    const ctx = makeCtx(5);
    const result = await mw.beforeAgent(ctx);
    expect(result.messages.length).toBe(ctx.messages.length);
  });

  it('Ollama 호출 실패 시 원본 ctx를 반환한다 (graceful failure)', async () => {
    const { chat } = await import('@/lib/ollama/client');
    (chat as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('connection refused')
    );

    const mw = new SummarizationMiddleware(1000);
    const ctx = makeCtx(20);
    const result = await mw.beforeAgent(ctx);
    // 에러 시 원본 반환
    expect(result.messages.length).toBe(ctx.messages.length);
  });
});
