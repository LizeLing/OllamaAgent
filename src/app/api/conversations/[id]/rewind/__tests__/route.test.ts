import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks (must precede route import) ──
vi.mock('@/lib/conversations/storage', () => ({
  getConversation: vi.fn(),
  rewindConversation: vi.fn(),
}));

import { NextRequest } from 'next/server';
import { POST } from '../route';
import { getConversation, rewindConversation } from '@/lib/conversations/storage';

function makeRequest(id: string, body: unknown): { req: NextRequest; ctx: { params: Promise<{ id: string }> } } {
  const req = new NextRequest(`http://localhost:3000/api/conversations/${id}/rewind`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
  return { req, ctx: { params: Promise.resolve({ id }) } };
}

function makeConv(id: string, msgCount: number) {
  return {
    id,
    title: 'Test',
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

describe('POST /api/conversations/[id]/rewind', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('유효한 요청 시 200과 되감긴 대화를 반환한다', async () => {
    const conv = makeConv('conv-1', 10);
    vi.mocked(getConversation).mockResolvedValue(conv);
    vi.mocked(rewindConversation).mockResolvedValue({
      ...conv,
      messages: conv.messages.slice(0, 6),
      messageCount: 6,
      rewoundFrom: { messageIndex: 5, previousLength: 10, rewoundAt: 123 },
    });

    const { req, ctx } = makeRequest('conv-1', { messageIndex: 5 });
    const res = await POST(req, ctx);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.id).toBe('conv-1');
    expect(body.conversation.messages).toHaveLength(6);
    expect(body.rewoundFrom.messageIndex).toBe(5);
    expect(rewindConversation).toHaveBeenCalledWith('conv-1', 5);
  });

  it('존재하지 않는 대화 id이면 404를 반환한다', async () => {
    vi.mocked(getConversation).mockResolvedValue(null);

    const { req, ctx } = makeRequest('missing', { messageIndex: 0 });
    const res = await POST(req, ctx);
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toBeDefined();
    expect(rewindConversation).not.toHaveBeenCalled();
  });

  it('음수 messageIndex이면 400을 반환한다', async () => {
    const { req, ctx } = makeRequest('conv-1', { messageIndex: -1 });
    const res = await POST(req, ctx);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/messageIndex/);
    expect(rewindConversation).not.toHaveBeenCalled();
  });

  it('비정수 messageIndex이면 400을 반환한다', async () => {
    const { req, ctx } = makeRequest('conv-1', { messageIndex: 1.5 });
    const res = await POST(req, ctx);

    expect(res.status).toBe(400);
    expect(rewindConversation).not.toHaveBeenCalled();
  });

  it('messageIndex가 누락되면 400을 반환한다', async () => {
    const { req, ctx } = makeRequest('conv-1', {});
    const res = await POST(req, ctx);

    expect(res.status).toBe(400);
    expect(rewindConversation).not.toHaveBeenCalled();
  });

  it('messageIndex가 messages 길이 이상이면 400을 반환한다', async () => {
    vi.mocked(getConversation).mockResolvedValue(makeConv('conv-1', 3));

    const { req, ctx } = makeRequest('conv-1', { messageIndex: 5 });
    const res = await POST(req, ctx);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/messageIndex|초과|length/);
    expect(rewindConversation).not.toHaveBeenCalled();
  });

  it('유효한 경계 messageIndex (messages.length-1)도 허용한다', async () => {
    const conv = makeConv('conv-1', 4);
    vi.mocked(getConversation).mockResolvedValue(conv);
    vi.mocked(rewindConversation).mockResolvedValue({
      ...conv,
      rewoundFrom: { messageIndex: 3, previousLength: 4, rewoundAt: 1 },
    });

    const { req, ctx } = makeRequest('conv-1', { messageIndex: 3 });
    const res = await POST(req, ctx);

    expect(res.status).toBe(200);
    expect(rewindConversation).toHaveBeenCalledWith('conv-1', 3);
  });

  it('빈 body로도 400을 정상 응답한다', async () => {
    const req = new NextRequest('http://localhost:3000/api/conversations/conv-1/rewind', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '',
    });
    const ctx = { params: Promise.resolve({ id: 'conv-1' }) };
    const res = await POST(req, ctx);

    expect(res.status).toBe(400);
  });
});
