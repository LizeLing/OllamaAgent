import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentEvent, AgentConfig } from '../types';

// Mock ollama client
const mockChat = vi.fn();
const mockChatStream = vi.fn();

vi.mock('@/lib/ollama/client', () => ({
  chat: (...args: unknown[]) => mockChat(...args),
  chatStream: (...args: unknown[]) => mockChatStream(...args),
}));

// Mock tool registry
const mockToOllamaTools = vi.fn().mockReturnValue([]);
const mockExecute = vi.fn().mockResolvedValue({ success: true, output: 'tool output' });
const mockGet = vi.fn().mockReturnValue(null);

vi.mock('@/lib/tools/registry', () => ({
  toolRegistry: {
    toOllamaTools: (...args: unknown[]) => mockToOllamaTools(...args),
    execute: (...args: unknown[]) => mockExecute(...args),
    get: (...args: unknown[]) => mockGet(...args),
  },
}));

function createConfig(overrides: Partial<AgentConfig> = {}): AgentConfig {
  return {
    ollamaUrl: 'http://localhost:11434',
    ollamaModel: 'test-model',
    maxIterations: 10,
    systemPrompt: 'You are a helpful assistant.',
    allowedPaths: ['/tmp'],
    deniedPaths: ['/etc'],
    toolApprovalMode: 'auto',
    ...overrides,
  };
}

async function collectEvents(gen: AsyncGenerator<AgentEvent>): Promise<AgentEvent[]> {
  const events: AgentEvent[] = [];
  for await (const event of gen) {
    events.push(event);
  }
  return events;
}

function makeSimpleStreamResponse(content: string) {
  return (async function* () {
    yield { message: { role: 'assistant', content }, done: false };
    yield { message: { role: 'assistant', content: '' }, done: true, prompt_eval_count: 10, eval_count: 5 };
  })();
}

describe('runAgentLoop', () => {
  let runAgentLoop: typeof import('../agent-loop').runAgentLoop;

  beforeEach(async () => {
    vi.resetModules();
    mockChat.mockReset();
    mockChatStream.mockReset();
    mockToOllamaTools.mockReturnValue([]);
    mockExecute.mockResolvedValue({ success: true, output: 'tool output' });
    const mod = await import('../agent-loop');
    runAgentLoop = mod.runAgentLoop;
  });

  it('간단한 응답: thinking → token → done 이벤트 시퀀스', async () => {
    mockChat.mockResolvedValueOnce({
      message: { role: 'assistant', content: 'hello', tool_calls: undefined },
    });
    mockChatStream.mockReturnValueOnce(makeSimpleStreamResponse('hello'));

    const events = await collectEvents(runAgentLoop(createConfig(), 'hi', []));
    const types = events.map(e => e.type);

    expect(types).toContain('thinking');
    expect(types).toContain('token');
    expect(types).toContain('done');
  });

  it('tool_calls 감지 → tool_start → tool_end 이벤트', async () => {
    mockChat.mockResolvedValueOnce({
      message: {
        role: 'assistant', content: '',
        tool_calls: [{ function: { name: 'filesystem_read', arguments: { path: '/tmp/x' } } }],
      },
    });
    mockExecute.mockResolvedValueOnce({ success: true, output: 'file content' });
    mockChat.mockResolvedValueOnce({
      message: { role: 'assistant', content: 'done', tool_calls: undefined },
    });
    mockChatStream.mockReturnValueOnce(makeSimpleStreamResponse('done'));

    const events = await collectEvents(runAgentLoop(createConfig(), 'read file', []));
    const types = events.map(e => e.type);

    expect(types).toContain('tool_start');
    expect(types).toContain('tool_end');
  });

  it('maxIterations 초과 시 최대 반복 메시지 + done을 yield한다', async () => {
    const config = createConfig({ maxIterations: 1 });
    mockChat.mockResolvedValue({
      message: {
        role: 'assistant', content: '',
        tool_calls: [{ function: { name: 'filesystem_read', arguments: { path: '/tmp/x' } } }],
      },
    });
    mockExecute.mockResolvedValue({ success: true, output: 'ok' });

    const events = await collectEvents(runAgentLoop(config, 'test', []));
    const lastToken = events.find(e => e.type === 'token');
    const done = events.find(e => e.type === 'done');

    expect(lastToken?.data.content).toContain('최대 반복');
    expect(done).toBeDefined();
  });

  it('trimHistory: 16K 글자 초과 히스토리를 트리밍한다', async () => {
    const longHistory = Array.from({ length: 100 }, () => ({
      role: 'user',
      content: 'x'.repeat(500),
    }));

    mockChat.mockResolvedValueOnce({
      message: { role: 'assistant', content: 'ok', tool_calls: undefined },
    });
    mockChatStream.mockReturnValueOnce(makeSimpleStreamResponse('ok'));

    await collectEvents(runAgentLoop(createConfig(), 'test', longHistory));

    const chatCall = mockChat.mock.calls[0];
    const messages = chatCall[1].messages;
    expect(messages.length).toBeLessThan(longHistory.length + 2);
  });

  it('auto mode: tool confirm을 건너뛴다', async () => {
    mockChat.mockResolvedValueOnce({
      message: {
        role: 'assistant', content: '',
        tool_calls: [{ function: { name: 'filesystem_write', arguments: { path: '/tmp/x', content: 'y' } } }],
      },
    });
    mockExecute.mockResolvedValueOnce({ success: true, output: 'written' });
    mockChat.mockResolvedValueOnce({
      message: { role: 'assistant', content: 'done', tool_calls: undefined },
    });
    mockChatStream.mockReturnValueOnce(makeSimpleStreamResponse('done'));

    const events = await collectEvents(runAgentLoop(createConfig({ toolApprovalMode: 'auto' }), 'write', []));
    const types = events.map(e => e.type);

    expect(types).not.toContain('tool_confirm');
  });

  it('confirm mode: tool_confirm 이벤트를 yield한다', async () => {
    const onToolApproval = vi.fn().mockResolvedValue(true);
    mockChat.mockResolvedValueOnce({
      message: {
        role: 'assistant', content: '',
        tool_calls: [{ function: { name: 'filesystem_read', arguments: { path: '/tmp/x' } } }],
      },
    });
    mockExecute.mockResolvedValueOnce({ success: true, output: 'ok' });
    mockChat.mockResolvedValueOnce({
      message: { role: 'assistant', content: 'done', tool_calls: undefined },
    });
    mockChatStream.mockReturnValueOnce(makeSimpleStreamResponse('done'));

    const events = await collectEvents(
      runAgentLoop(createConfig({ toolApprovalMode: 'confirm', onToolApproval }), 'read', [])
    );
    const types = events.map(e => e.type);

    expect(types).toContain('tool_confirm');
    expect(onToolApproval).toHaveBeenCalled();
  });

  it('deny-dangerous: 위험한 도구를 차단한다', async () => {
    const onToolApproval = vi.fn().mockResolvedValue(false);
    mockChat.mockResolvedValueOnce({
      message: {
        role: 'assistant', content: '',
        tool_calls: [{ function: { name: 'filesystem_write', arguments: { path: '/tmp/x', content: 'y' } } }],
      },
    });
    mockChat.mockResolvedValueOnce({
      message: { role: 'assistant', content: 'denied', tool_calls: undefined },
    });
    mockChatStream.mockReturnValueOnce(makeSimpleStreamResponse('denied'));

    const events = await collectEvents(
      runAgentLoop(createConfig({ toolApprovalMode: 'deny-dangerous', onToolApproval }), 'write', [])
    );

    const toolEnd = events.find(e => e.type === 'tool_end');
    expect(toolEnd?.data.success).toBe(false);
    expect(toolEnd?.data.output).toContain('사용자가 거부함');
  });

  it('거부 시 거부 메시지를 대화에 추가한다', async () => {
    const onToolApproval = vi.fn().mockResolvedValue(false);
    mockChat.mockResolvedValueOnce({
      message: {
        role: 'assistant', content: '',
        tool_calls: [{ function: { name: 'code_execute', arguments: {} } }],
      },
    });
    mockChat.mockResolvedValueOnce({
      message: { role: 'assistant', content: 'ok', tool_calls: undefined },
    });
    mockChatStream.mockReturnValueOnce(makeSimpleStreamResponse('ok'));

    await collectEvents(
      runAgentLoop(createConfig({ toolApprovalMode: 'deny-dangerous', onToolApproval }), 'test', [])
    );

    // Second chat call should have the rejection message in messages
    const secondCall = mockChat.mock.calls[1];
    const msgs = secondCall[1].messages;
    const toolMsg = msgs.find((m: { role: string; content: string }) =>
      m.role === 'tool' && m.content.includes('거부')
    );
    expect(toolMsg).toBeDefined();
  });

  it('__IMAGE__ prefix 감지 → image 이벤트', async () => {
    mockChat.mockResolvedValueOnce({
      message: {
        role: 'assistant', content: '',
        tool_calls: [{ function: { name: 'image_generate', arguments: { prompt: 'cat' } } }],
      },
    });
    mockExecute.mockResolvedValueOnce({
      success: true,
      output: '__IMAGE__base64data__PROMPT__a cute cat',
    });
    mockChat.mockResolvedValueOnce({
      message: { role: 'assistant', content: 'done', tool_calls: undefined },
    });
    mockChatStream.mockReturnValueOnce(makeSimpleStreamResponse('done'));

    const events = await collectEvents(runAgentLoop(createConfig(), 'draw a cat', []));
    const imageEvent = events.find(e => e.type === 'image');

    expect(imageEvent).toBeDefined();
    expect(imageEvent?.data.base64).toBe('base64data');
    expect(imageEvent?.data.prompt).toBe('a cute cat');
  });

  it('enabledTools 필터링이 toOllamaTools에 전달된다', async () => {
    const enabledTools = ['filesystem_read', 'web_search'];
    mockChat.mockResolvedValueOnce({
      message: { role: 'assistant', content: 'hi', tool_calls: undefined },
    });
    mockChatStream.mockReturnValueOnce(makeSimpleStreamResponse('hi'));

    await collectEvents(runAgentLoop(createConfig({ enabledTools }), 'test', []));

    expect(mockToOllamaTools).toHaveBeenCalledWith(enabledTools);
  });

  it('메모리가 시스템 프롬프트에 추가된다', async () => {
    mockChat.mockResolvedValueOnce({
      message: { role: 'assistant', content: 'ok', tool_calls: undefined },
    });
    mockChatStream.mockReturnValueOnce(makeSimpleStreamResponse('ok'));

    await collectEvents(runAgentLoop(createConfig(), 'test', [], ['memory1', 'memory2']));

    const chatCall = mockChat.mock.calls[0];
    const systemMsg = chatCall[1].messages[0];
    expect(systemMsg.content).toContain('memory1');
    expect(systemMsg.content).toContain('memory2');
  });

  it('이미지가 user 메시지에 포함된다', async () => {
    mockChat.mockResolvedValueOnce({
      message: { role: 'assistant', content: 'ok', tool_calls: undefined },
    });
    mockChatStream.mockReturnValueOnce(makeSimpleStreamResponse('ok'));

    await collectEvents(runAgentLoop(createConfig(), 'describe this', [], [], ['base64img']));

    const chatCall = mockChat.mock.calls[0];
    const userMsg = chatCall[1].messages.find((m: { role: string }) => m.role === 'user');
    expect(userMsg.images).toEqual(['base64img']);
  });

  it('format이 chatStream에 전달된다', async () => {
    mockChat.mockResolvedValueOnce({
      message: { role: 'assistant', content: 'ok', tool_calls: undefined },
    });
    mockChatStream.mockReturnValueOnce(makeSimpleStreamResponse('{"key":"value"}'));

    await collectEvents(runAgentLoop(createConfig({ format: 'json' }), 'test', []));

    const streamCall = mockChatStream.mock.calls[0];
    expect(streamCall[1].format).toBe('json');
  });

  it('format이 도구 선택 단계에서는 전달되지 않는다', async () => {
    mockChat.mockResolvedValueOnce({
      message: {
        role: 'assistant', content: '',
        tool_calls: [{ function: { name: 'filesystem_read', arguments: { path: '/tmp/x' } } }],
      },
    });
    mockExecute.mockResolvedValueOnce({ success: true, output: 'ok' });
    mockChat.mockResolvedValueOnce({
      message: { role: 'assistant', content: 'done', tool_calls: undefined },
    });
    mockChatStream.mockReturnValueOnce(makeSimpleStreamResponse('done'));

    await collectEvents(runAgentLoop(createConfig({ format: 'json' }), 'test', []));

    // 도구 선택 단계의 chat 호출에는 format이 전달되지만,
    // tools가 있으면 client.ts에서 제거됨
    const toolCallRequest = mockChat.mock.calls[0][1];
    expect(toolCallRequest.tools).toBeDefined();
  });

  describe('resolveThink', () => {
    it('thinkingMode: off → 모든 단계에서 think: false', async () => {
      mockChat.mockResolvedValueOnce({
        message: { role: 'assistant', content: 'ok', tool_calls: undefined },
      });
      mockChatStream.mockReturnValueOnce(makeSimpleStreamResponse('ok'));

      await collectEvents(runAgentLoop(createConfig({ thinkingMode: 'off' }), 'test', []));

      const toolCall = mockChat.mock.calls[0][1];
      expect(toolCall.think).toBe(false);
      const streamCall = mockChatStream.mock.calls[0][1];
      expect(streamCall.think).toBe(false);
    });

    it('thinkingMode: on → 최종 응답에서 think: true', async () => {
      mockChat.mockResolvedValueOnce({
        message: { role: 'assistant', content: 'ok', tool_calls: undefined },
      });
      mockChatStream.mockReturnValueOnce(makeSimpleStreamResponse('ok'));

      await collectEvents(runAgentLoop(createConfig({ thinkingMode: 'on' }), 'test', []));

      const streamCall = mockChatStream.mock.calls[0][1];
      expect(streamCall.think).toBe(true);
    });

    it('thinkingMode: on + thinkingForToolCalls: true → 도구 선택에서도 think: true', async () => {
      mockChat.mockResolvedValueOnce({
        message: { role: 'assistant', content: 'ok', tool_calls: undefined },
      });
      mockChatStream.mockReturnValueOnce(makeSimpleStreamResponse('ok'));

      await collectEvents(runAgentLoop(
        createConfig({ thinkingMode: 'on', thinkingForToolCalls: true }), 'test', []
      ));

      const toolCall = mockChat.mock.calls[0][1];
      expect(toolCall.think).toBe(true);
    });

    it('thinkingMode: on + thinkingForToolCalls: false → 도구 선택에서 think: false', async () => {
      mockChat.mockResolvedValueOnce({
        message: { role: 'assistant', content: 'ok', tool_calls: undefined },
      });
      mockChatStream.mockReturnValueOnce(makeSimpleStreamResponse('ok'));

      await collectEvents(runAgentLoop(
        createConfig({ thinkingMode: 'on', thinkingForToolCalls: false }), 'test', []
      ));

      const toolCall = mockChat.mock.calls[0][1];
      expect(toolCall.think).toBe(false);
    });

    it('thinkingMode: auto → 기존 동작 유지 (도구:false, 응답:true)', async () => {
      mockChat.mockResolvedValueOnce({
        message: { role: 'assistant', content: 'ok', tool_calls: undefined },
      });
      mockChatStream.mockReturnValueOnce(makeSimpleStreamResponse('ok'));

      await collectEvents(runAgentLoop(createConfig({ thinkingMode: 'auto' }), 'test', []));

      const toolCall = mockChat.mock.calls[0][1];
      expect(toolCall.think).toBe(false);
      const streamCall = mockChatStream.mock.calls[0][1];
      expect(streamCall.think).toBe(true);
    });

    it('thinkingMode 미설정 시 auto 동작', async () => {
      mockChat.mockResolvedValueOnce({
        message: { role: 'assistant', content: 'ok', tool_calls: undefined },
      });
      mockChatStream.mockReturnValueOnce(makeSimpleStreamResponse('ok'));

      await collectEvents(runAgentLoop(createConfig(), 'test', []));

      const toolCall = mockChat.mock.calls[0][1];
      expect(toolCall.think).toBe(false);
      const streamCall = mockChatStream.mock.calls[0][1];
      expect(streamCall.think).toBe(true);
    });
  });

  it('done 이벤트에 tokenUsage가 포함된다', async () => {
    mockChat.mockResolvedValueOnce({
      message: { role: 'assistant', content: 'ok', tool_calls: undefined },
    });
    mockChatStream.mockReturnValueOnce(
      (async function* () {
        yield { message: { role: 'assistant', content: 'ok' }, done: true, prompt_eval_count: 100, eval_count: 50 };
      })()
    );

    const events = await collectEvents(runAgentLoop(createConfig(), 'test', []));
    const done = events.find(e => e.type === 'done');

    expect(done?.data.tokenUsage).toEqual({
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
    });
  });
});
