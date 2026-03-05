import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks (must be declared BEFORE importing the route) ──

vi.mock('@/lib/conversations/storage', () => ({
  searchConversations: vi.fn(),
}));

// ── Imports (after mocks) ──

import { NextRequest } from 'next/server';
import { GET } from '../route';
import { searchConversations } from '@/lib/conversations/storage';

// ── Helpers ──

function makeRequest(query?: string): NextRequest {
  const url = query
    ? `http://localhost:3000/api/conversations/search?q=${encodeURIComponent(query)}`
    : 'http://localhost:3000/api/conversations/search';
  return new NextRequest(url, { method: 'GET' });
}

// ── Tests ──

describe('GET /api/conversations/search', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns search results for a query', async () => {
    const mockResults = [
      { id: '1', title: 'Found it', createdAt: 100, updatedAt: 100, messageCount: 1 },
    ];
    vi.mocked(searchConversations).mockResolvedValue(mockResults);

    const res = await GET(makeRequest('hello'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual(mockResults);
    expect(searchConversations).toHaveBeenCalledWith('hello');
  });

  it('returns empty array for empty query string', async () => {
    const res = await GET(makeRequest(''));
    const body = await res.json();

    expect(body).toEqual([]);
    expect(searchConversations).not.toHaveBeenCalled();
  });

  it('returns empty array when q param is missing', async () => {
    const res = await GET(makeRequest());
    const body = await res.json();

    expect(body).toEqual([]);
    expect(searchConversations).not.toHaveBeenCalled();
  });

  it('returns 500 when search throws', async () => {
    vi.mocked(searchConversations).mockRejectedValue(new Error('DB error'));

    const res = await GET(makeRequest('fail'));

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });
});
