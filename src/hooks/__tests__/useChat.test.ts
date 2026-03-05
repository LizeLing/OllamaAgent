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
});
