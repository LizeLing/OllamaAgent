import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useChat } from '../useChat';

vi.mock('uuid', () => ({ v4: () => 'mock-uuid' }));
vi.mock('@/hooks/useToast', () => ({ addToast: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
});

function mockFetchSSE(events: string) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(events));
      controller.close();
    },
  });
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    body: stream,
  });
}

describe('useChat', () => {
  it('initializes with empty state', () => {
    const { result } = renderHook(() => useChat());
    expect(result.current.messages).toEqual([]);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.conversationId).toBeNull();
    expect(result.current.pendingApproval).toBeNull();
  });

  it('sendMessage sends POST to /api/chat', async () => {
    const sseData = 'event: token\ndata: {"content":"Hi"}\n\nevent: done\ndata: {}\n\n';
    global.fetch = mockFetchSSE(sseData);

    const { result } = renderHook(() => useChat());

    await act(async () => {
      await result.current.sendMessage('Hello');
    });

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/chat',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('Hello'),
      })
    );
  });

  it('processes token SSE events', async () => {
    const sseData = 'event: token\ndata: {"content":"Hello "}\n\nevent: token\ndata: {"content":"World"}\n\nevent: done\ndata: {}\n\n';
    global.fetch = mockFetchSSE(sseData);

    const { result } = renderHook(() => useChat());

    await act(async () => {
      await result.current.sendMessage('Hi');
    });

    // user message + assistant message
    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages[1].content).toBe('Hello World');
  });

  it('processes tool_start and tool_end events', async () => {
    const sseData = [
      'event: tool_start\ndata: {"tool":"fs_read","input":{"path":"/tmp"}}\n',
      'event: tool_end\ndata: {"tool":"fs_read","output":"ok","success":true}\n',
      'event: done\ndata: {}\n\n',
    ].join('\n');
    global.fetch = mockFetchSSE(sseData);

    const { result } = renderHook(() => useChat());

    await act(async () => {
      await result.current.sendMessage('test');
    });

    const assistant = result.current.messages[1];
    expect(assistant.toolCalls).toHaveLength(1);
    expect(assistant.toolCalls![0].tool).toBe('fs_read');
    expect(assistant.toolCalls![0].success).toBe(true);
  });

  it('stopGeneration aborts and sets isLoading false', async () => {
    // Use a never-resolving fetch
    global.fetch = vi.fn().mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useChat());

    // Start sending (don't await)
    act(() => {
      result.current.sendMessage('test');
    });

    await waitFor(() => expect(result.current.isLoading).toBe(true));

    act(() => {
      result.current.stopGeneration();
    });

    expect(result.current.isLoading).toBe(false);
  });

  it('clearMessages resets state', async () => {
    const sseData = 'event: token\ndata: {"content":"Hi"}\n\nevent: done\ndata: {}\n\n';
    global.fetch = mockFetchSSE(sseData);

    const { result } = renderHook(() => useChat());

    await act(async () => {
      await result.current.sendMessage('test');
    });
    expect(result.current.messages.length).toBeGreaterThan(0);

    act(() => {
      result.current.clearMessages();
    });
    expect(result.current.messages).toEqual([]);
    expect(result.current.conversationId).toBeNull();
  });

  it('handles fetch errors', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 });

    const { result } = renderHook(() => useChat());

    await act(async () => {
      await result.current.sendMessage('test');
    });

    expect(result.current.error).toBe('HTTP 500');
  });

  it('loadConversation fetches and sets messages', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ messages: [{ id: '1', role: 'user', content: 'hi', timestamp: 0 }] }),
    });

    const { result } = renderHook(() => useChat());

    await act(async () => {
      await result.current.loadConversation('conv-1');
    });

    expect(result.current.messages).toHaveLength(1);
    expect(result.current.conversationId).toBe('conv-1');
  });

  it('respondToApproval sends confirm request', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true });

    const { result } = renderHook(() => useChat());

    await act(async () => {
      await result.current.respondToApproval('confirm-1', true);
    });

    expect(global.fetch).toHaveBeenCalledWith('/api/chat/confirm', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ confirmId: 'confirm-1', approved: true }),
    }));
  });

  it('sendMessage에 format 파라미터를 전달한다', async () => {
    const sseData = 'event: token\ndata: {"content":"ok"}\n\nevent: done\ndata: {}\n\n';
    global.fetch = mockFetchSSE(sseData);

    const { result } = renderHook(() => useChat());

    await act(async () => {
      await result.current.sendMessage('test', undefined, undefined, 'json');
    });

    const fetchCall = vi.mocked(global.fetch).mock.calls[0];
    const body = JSON.parse(fetchCall[1]?.body as string);
    expect(body.format).toBe('json');
  });

  it('format 없이 sendMessage를 호출하면 format이 body에 없다', async () => {
    const sseData = 'event: token\ndata: {"content":"ok"}\n\nevent: done\ndata: {}\n\n';
    global.fetch = mockFetchSSE(sseData);

    const { result } = renderHook(() => useChat());

    await act(async () => {
      await result.current.sendMessage('test');
    });

    const fetchCall = vi.mocked(global.fetch).mock.calls[0];
    const body = JSON.parse(fetchCall[1]?.body as string);
    expect(body.format).toBeUndefined();
  });
});

describe('useChat - Task Mode', () => {
  it('초기 상태에서 taskId는 null, taskMode는 chat이다', () => {
    const { result } = renderHook(() => useChat());
    expect(result.current.taskId).toBeNull();
    expect(result.current.taskMode).toBe('chat');
  });

  it('handleTaskCommand new는 /api/tasks에 POST 요청을 보내고 taskId/taskMode를 설정한다', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ id: 'task_1', title: '목표 샘플' }),
    });

    const { result } = renderHook(() => useChat());

    let cmdRes: Awaited<ReturnType<typeof result.current.handleTaskCommand>> | undefined;
    await act(async () => {
      cmdRes = await result.current.handleTaskCommand(['new 목표 샘플']);
    });

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/tasks',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('목표 샘플'),
      }),
    );
    expect(cmdRes?.ok).toBe(true);
    expect(cmdRes?.taskId).toBe('task_1');
    expect(result.current.taskId).toBe('task_1');
    expect(result.current.taskMode).toBe('task');
  });

  it('handleTaskCommand open은 GET /api/tasks/:id로 로드하고 Task Mode로 전환한다', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ id: 'task_abc', title: '기존 Task' }),
    });

    const { result } = renderHook(() => useChat());

    await act(async () => {
      await result.current.handleTaskCommand(['open task_abc']);
    });

    expect(global.fetch).toHaveBeenCalledWith('/api/tasks/task_abc');
    expect(result.current.taskId).toBe('task_abc');
    expect(result.current.taskMode).toBe('task');
  });

  it('handleTaskCommand new는 goal이 없으면 실패 응답을 반환한다', async () => {
    global.fetch = vi.fn();
    const { result } = renderHook(() => useChat());

    let res: Awaited<ReturnType<typeof result.current.handleTaskCommand>> | undefined;
    await act(async () => {
      res = await result.current.handleTaskCommand(['new']);
    });

    expect(res?.ok).toBe(false);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('handleTaskCommand sub-command가 없으면 usage 안내 메시지를 반환한다', async () => {
    const { result } = renderHook(() => useChat());
    let res: Awaited<ReturnType<typeof result.current.handleTaskCommand>> | undefined;
    await act(async () => {
      res = await result.current.handleTaskCommand(['']);
    });
    expect(res?.ok).toBe(false);
    expect(res?.message).toMatch(/사용법/);
  });

  it('handleTaskCommand checkpoint는 활성 taskId가 없으면 실패한다', async () => {
    global.fetch = vi.fn();
    const { result } = renderHook(() => useChat());
    let res: Awaited<ReturnType<typeof result.current.handleTaskCommand>> | undefined;
    await act(async () => {
      res = await result.current.handleTaskCommand(['checkpoint']);
    });
    expect(res?.ok).toBe(false);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('Task Mode 활성 상태에서 sendMessage는 body에 taskId와 taskMode를 포함한다', async () => {
    const sseData = 'event: token\ndata: {"content":"ok"}\n\nevent: done\ndata: {}\n\n';
    global.fetch = vi
      .fn()
      // 1) handleTaskCommand new 호출
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ id: 'task_x', title: 't' }),
      })
      // 2) sendMessage 호출
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(sseData));
            controller.close();
          },
        }),
      });

    const { result } = renderHook(() => useChat());

    await act(async () => {
      await result.current.handleTaskCommand(['new 목표']);
    });
    expect(result.current.taskMode).toBe('task');

    await act(async () => {
      await result.current.sendMessage('hello');
    });

    const calls = vi.mocked(global.fetch).mock.calls;
    const chatCall = calls.find((c) => c[0] === '/api/chat');
    expect(chatCall).toBeDefined();
    const body = JSON.parse(chatCall![1]!.body as string);
    expect(body.taskId).toBe('task_x');
    expect(body.taskMode).toBe('task');
  });

  it('Chat Mode에서 sendMessage는 body에 taskId / taskMode를 포함하지 않는다', async () => {
    const sseData = 'event: token\ndata: {"content":"ok"}\n\nevent: done\ndata: {}\n\n';
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(sseData));
          controller.close();
        },
      }),
    });

    const { result } = renderHook(() => useChat());

    await act(async () => {
      await result.current.sendMessage('hi');
    });

    const calls = vi.mocked(global.fetch).mock.calls;
    const body = JSON.parse(calls[0][1]?.body as string);
    expect(body.taskId).toBeUndefined();
    expect(body.taskMode).toBeUndefined();
  });

  it('handleTaskCommand done은 taskId 초기화 후 Chat Mode로 복귀한다', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ id: 'task_close', title: 'c' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({}),
      });

    const { result } = renderHook(() => useChat());

    await act(async () => {
      await result.current.handleTaskCommand(['new 목표']);
    });
    expect(result.current.taskMode).toBe('task');

    await act(async () => {
      await result.current.handleTaskCommand(['done']);
    });

    expect(result.current.taskId).toBeNull();
    expect(result.current.taskMode).toBe('chat');
  });
});
