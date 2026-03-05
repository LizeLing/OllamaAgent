import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks (must be declared BEFORE importing the route) ──

vi.mock('@/lib/conversations/storage', () => ({
  getConversation: vi.fn(),
}));

// ── Imports (after mocks) ──

import { NextRequest } from 'next/server';
import { GET } from '../route';
import { getConversation } from '@/lib/conversations/storage';

// ── Helpers ──

const mockConversation = {
  id: 'conv-1',
  title: 'Test Export',
  createdAt: 1700000000000,
  updatedAt: 1700000000000,
  messageCount: 2,
  messages: [
    { role: 'user', content: 'Hello', timestamp: 1700000000000 },
    { role: 'assistant', content: 'Hi there', timestamp: 1700000001000 },
  ],
};

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

function makeRequest(id: string, format?: string): NextRequest {
  const url = format
    ? `http://localhost:3000/api/conversations/${id}/export?format=${format}`
    : `http://localhost:3000/api/conversations/${id}/export`;
  return new NextRequest(url, { method: 'GET' });
}

// ── Tests ──

describe('GET /api/conversations/[id]/export', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exports conversation in JSON format by default', async () => {
    vi.mocked(getConversation).mockResolvedValue(mockConversation);

    const res = await GET(makeRequest('conv-1'), makeParams('conv-1'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.id).toBe('conv-1');
    expect(body.title).toBe('Test Export');
  });

  it('exports conversation in markdown format', async () => {
    vi.mocked(getConversation).mockResolvedValue(mockConversation);

    const res = await GET(makeRequest('conv-1', 'markdown'), makeParams('conv-1'));
    const text = await res.text();

    expect(res.headers.get('Content-Type')).toContain('text/markdown');
    expect(text).toContain('# Test Export');
    expect(text).toContain('Hello');
    expect(text).toContain('Hi there');
  });

  it('returns 404 when conversation not found', async () => {
    vi.mocked(getConversation).mockResolvedValue(null);

    const res = await GET(makeRequest('nonexistent'), makeParams('nonexistent'));

    expect(res.status).toBe(404);
  });

  it('JSON export includes Content-Disposition header', async () => {
    vi.mocked(getConversation).mockResolvedValue(mockConversation);

    const res = await GET(makeRequest('conv-1'), makeParams('conv-1'));

    const disposition = res.headers.get('Content-Disposition');
    expect(disposition).toContain('attachment');
    expect(disposition).toContain('conv-1.json');
  });
});
