import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks (must be declared BEFORE importing the route) ──

vi.mock('@/lib/middleware/rate-limiter', () => ({
  checkRateLimit: vi.fn(() => true),
  RATE_LIMITS: { chat: { maxTokens: 30, refillPerSecond: 0.5 } },
}));

vi.mock('@/lib/ollama/streaming', () => ({
  formatSSE: vi.fn(
    (event: string, data: Record<string, unknown>) =>
      `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`,
  ),
}));

vi.mock('@/lib/config/settings', () => ({
  loadSettings: vi.fn(() =>
    Promise.resolve({
      ollamaUrl: 'http://localhost:11434',
      ollamaModel: 'llama3',
      embeddingModel: 'nomic-embed-text',
      maxIterations: 10,
      systemPrompt: '',
      allowedPaths: [],
      deniedPaths: [],
      searxngUrl: '',
      imageModel: '',
      toolApprovalMode: 'auto',
      customTools: [],
      mcpServers: [],
      enabledTools: [],
      modelOptions: null,
    }),
  ),
}));

vi.mock('@/lib/tools/init', () => ({
  initializeTools: vi.fn(),
  registerCustomTools: vi.fn(),
  registerMcpTools: vi.fn(() => Promise.resolve()),
}));

vi.mock('@/lib/memory/memory-manager', () => {
  const searchMemories = vi.fn(() => Promise.resolve([]));
  const saveConversationSummary = vi.fn(() => Promise.resolve());
  return {
    MemoryManager: vi.fn(() => ({
      searchMemories,
      saveConversationSummary,
    })),
  };
});

vi.mock('@/lib/agent/agent-loop', () => ({
  runAgentLoop: vi.fn(),
}));

vi.mock('@/lib/agent/approval', () => ({
  waitForApproval: vi.fn(() => Promise.resolve(true)),
}));

// ── Imports (after mocks) ──

import { NextRequest } from 'next/server';
import { POST } from '../route';
import { checkRateLimit } from '@/lib/middleware/rate-limiter';
import { loadSettings } from '@/lib/config/settings';
import { initializeTools } from '@/lib/tools/init';
import { runAgentLoop } from '@/lib/agent/agent-loop';
import { MemoryManager } from '@/lib/memory/memory-manager';

// ── Helpers ──

function makeRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost:3000/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function readSSEStream(response: Response): Promise<string> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let result = '';
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    result += decoder.decode(value, { stream: true });
  }
  return result;
}

async function* fakeAgentLoop() {
  yield { type: 'token', data: { content: 'hello' } };
  yield { type: 'done', data: {} };
}

// ── Tests ──

describe('POST /api/chat', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(checkRateLimit).mockReturnValue(true);
    vi.mocked(runAgentLoop).mockReturnValue(fakeAgentLoop() as unknown as ReturnType<typeof runAgentLoop>);
  });

  it('returns SSE stream with 200 and correct content-type', async () => {
    const res = await POST(makeRequest({ message: 'hello' }));

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('text/event-stream');
  });

  it('returns 400 when message is missing', async () => {
    const res = await POST(makeRequest({}));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('message is required');
  });

  it('returns 400 when message is not a string', async () => {
    const res = await POST(makeRequest({ message: 123 }));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('message is required');
  });

  it('returns 429 when rate limit is exceeded', async () => {
    vi.mocked(checkRateLimit).mockReturnValue(false);

    const res = await POST(makeRequest({ message: 'hello' }));

    expect(res.status).toBe(429);
  });

  it('defaults history to empty array when not provided', async () => {
    await POST(makeRequest({ message: 'hi' }));

    expect(runAgentLoop).toHaveBeenCalledTimes(1);
    const callArgs = vi.mocked(runAgentLoop).mock.calls[0];
    // history is the 3rd argument (index 2)
    expect(callArgs[2]).toEqual([]);
  });

  it('loads settings and initializes tools', async () => {
    await POST(makeRequest({ message: 'hi' }));

    expect(loadSettings).toHaveBeenCalled();
    expect(initializeTools).toHaveBeenCalled();
  });

  it('sends SSE error event when agent loop throws', async () => {
    vi.mocked(runAgentLoop).mockReturnValue(
      (async function* () {
        throw new Error('agent failure');
      })() as unknown as ReturnType<typeof runAgentLoop>,
    );

    const res = await POST(makeRequest({ message: 'hi' }));
    const text = await readSSEStream(res);

    expect(text).toContain('event: error');
    expect(text).toContain('agent failure');
  });

  it('continues when memory search fails', async () => {
    const mockSearchMemories = vi.fn(() => Promise.reject(new Error('mem fail')));
    vi.mocked(MemoryManager).mockImplementation(
      () =>
        ({
          searchMemories: mockSearchMemories,
          saveConversationSummary: vi.fn(() => Promise.resolve()),
        }) as unknown as InstanceType<typeof MemoryManager>,
    );

    const res = await POST(makeRequest({ message: 'hello' }));

    expect(res.status).toBe(200);
    expect(runAgentLoop).toHaveBeenCalled();
  });
});
