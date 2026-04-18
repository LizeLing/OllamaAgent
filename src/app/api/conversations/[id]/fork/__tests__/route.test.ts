import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/conversations/storage', () => ({
  getConversation: vi.fn(),
  forkConversation: vi.fn(),
}));

import { NextRequest } from 'next/server';
import { POST } from '../route';
import { getConversation, forkConversation } from '@/lib/conversations/storage';

function makeRequest(id: string, body: unknown): { req: NextRequest; ctx: { params: Promise<{ id: string }> } } {
  const req = new NextRequest(`http://localhost:3000/api/conversations/${id}/fork`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
  return { req, ctx: { params: Promise.resolve({ id }) } };
}

function makeConv(id: string, msgCount: number) {
  return {
    id,
    title: 'Fork Source',
    createdAt: 1,
    updatedAt: 2,
    messageCount: msgCount,
    messages: Array.from({ length: msgCount }, (_, i) => ({
      id: `m${i}`,
      role: 'user' as const,
      content: `${i}`,
      timestamp: i,
    })),
  };
}

describe('POST /api/conversations/[id]/fork', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('유효한 요청 시 201과 포크된 대화를 반환한다', async () => {
    const src = makeConv('conv-1', 10);
    vi.mocked(getConversation).mockResolvedValue(src);
    vi.mocked(forkConversation).mockResolvedValue({
      id: 'new-uuid-123',
      title: 'Fork Source (분기)',
      createdAt: 100,
      updatedAt: 100,
      messageCount: 4,
      messages: src.messages.slice(0, 4),
      forkedFrom: { conversationId: 'conv-1', messageIndex: 3, forkedAt: 100 },
    });

    const { req, ctx } = makeRequest('conv-1', { messageIndex: 3 });
    const res = await POST(req, ctx);
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.id).toBe('new-uuid-123');
    expect(body.conversation.messages).toHaveLength(4);
    expect(body.forkedFrom.conversationId).toBe('conv-1');
    expect(body.forkedFrom.messageIndex).toBe(3);
  });

  it('title을 body로 전달하면 forkConversation에 전달된다', async () => {
    const src = makeConv('conv-1', 6);
    vi.mocked(getConversation).mockResolvedValue(src);
    vi.mocked(forkConversation).mockResolvedValue({
      id: 'child',
      title: '내 포크',
      createdAt: 1,
      updatedAt: 1,
      messageCount: 3,
      messages: src.messages.slice(0, 3),
      forkedFrom: { conversationId: 'conv-1', messageIndex: 2, forkedAt: 1 },
    });

    const { req, ctx } = makeRequest('conv-1', { messageIndex: 2, title: '내 포크' });
    const res = await POST(req, ctx);

    expect(res.status).toBe(201);
    expect(forkConversation).toHaveBeenCalledWith('conv-1', 2, { title: '내 포크' });
  });

  it('존재하지 않는 대화 id이면 404를 반환한다', async () => {
    vi.mocked(getConversation).mockResolvedValue(null);

    const { req, ctx } = makeRequest('missing', { messageIndex: 0 });
    const res = await POST(req, ctx);
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toBeDefined();
    expect(forkConversation).not.toHaveBeenCalled();
  });

  it('음수 messageIndex이면 400을 반환한다', async () => {
    const { req, ctx } = makeRequest('conv-1', { messageIndex: -1 });
    const res = await POST(req, ctx);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/messageIndex/);
    expect(forkConversation).not.toHaveBeenCalled();
  });

  it('비정수 messageIndex이면 400을 반환한다', async () => {
    const { req, ctx } = makeRequest('conv-1', { messageIndex: 0.5 });
    const res = await POST(req, ctx);

    expect(res.status).toBe(400);
    expect(forkConversation).not.toHaveBeenCalled();
  });

  it('messageIndex가 messages 길이 이상이면 400을 반환한다', async () => {
    vi.mocked(getConversation).mockResolvedValue(makeConv('conv-1', 3));

    const { req, ctx } = makeRequest('conv-1', { messageIndex: 3 });
    const res = await POST(req, ctx);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/messageIndex|초과|length/);
    expect(forkConversation).not.toHaveBeenCalled();
  });

  it('title이 100자를 초과하면 앞 100자로 자른다', async () => {
    const src = makeConv('conv-1', 4);
    vi.mocked(getConversation).mockResolvedValue(src);
    vi.mocked(forkConversation).mockResolvedValue({
      id: 'child',
      title: 'x'.repeat(100),
      createdAt: 1,
      updatedAt: 1,
      messageCount: 2,
      messages: src.messages.slice(0, 2),
      forkedFrom: { conversationId: 'conv-1', messageIndex: 1, forkedAt: 1 },
    });

    const longTitle = 'x'.repeat(500);
    const { req, ctx } = makeRequest('conv-1', { messageIndex: 1, title: longTitle });
    await POST(req, ctx);

    expect(forkConversation).toHaveBeenCalledWith(
      'conv-1',
      1,
      expect.objectContaining({ title: expect.stringMatching(/^x{100}$/) })
    );
  });

  it('title이 문자열이 아니면 undefined로 전달된다', async () => {
    const src = makeConv('conv-1', 4);
    vi.mocked(getConversation).mockResolvedValue(src);
    vi.mocked(forkConversation).mockResolvedValue({
      id: 'child',
      title: 'Fork Source (분기)',
      createdAt: 1,
      updatedAt: 1,
      messageCount: 2,
      messages: src.messages.slice(0, 2),
      forkedFrom: { conversationId: 'conv-1', messageIndex: 1, forkedAt: 1 },
    });

    const { req, ctx } = makeRequest('conv-1', { messageIndex: 1, title: 42 });
    await POST(req, ctx);

    expect(forkConversation).toHaveBeenCalledWith('conv-1', 1, { title: undefined });
  });

  it('빈 body이면 400을 반환한다', async () => {
    const req = new NextRequest('http://localhost:3000/api/conversations/conv-1/fork', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '',
    });
    const ctx = { params: Promise.resolve({ id: 'conv-1' }) };
    const res = await POST(req, ctx);

    expect(res.status).toBe(400);
  });
});
