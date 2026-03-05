import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks (must be declared BEFORE importing the route) ──

vi.mock('@/lib/conversations/storage', () => ({
  listConversations: vi.fn(),
  saveConversation: vi.fn(() => Promise.resolve()),
}));

vi.mock('uuid', () => ({
  v4: vi.fn(() => 'test-uuid'),
}));

// ── Imports (after mocks) ──

import { NextRequest } from 'next/server';
import { GET, POST } from '../route';
import { listConversations, saveConversation } from '@/lib/conversations/storage';

// ── Helpers ──

function makePostRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost:3000/api/conversations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// ── Tests ──

describe('/api/conversations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET', () => {
    it('returns conversation list', async () => {
      const mockConversations = [
        { id: '1', title: 'Test', createdAt: 100, updatedAt: 100, messageCount: 0, messages: [] },
      ];
      vi.mocked(listConversations).mockResolvedValue(mockConversations);

      const res = await GET();
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body).toEqual(mockConversations);
    });

    it('returns empty array when no conversations', async () => {
      vi.mocked(listConversations).mockResolvedValue([]);

      const res = await GET();
      const body = await res.json();

      expect(body).toEqual([]);
    });
  });

  describe('POST', () => {
    it('creates conversation with provided title', async () => {
      const res = await POST(makePostRequest({ title: 'My Chat' }));
      const body = await res.json();

      expect(res.status).toBe(201);
      expect(body.id).toBe('test-uuid');
      expect(body.title).toBe('My Chat');
      expect(saveConversation).toHaveBeenCalled();
    });

    it('creates conversation with default title when not provided', async () => {
      const res = await POST(makePostRequest({}));
      const body = await res.json();

      expect(res.status).toBe(201);
      expect(body.title).toBe('새 대화');
    });

    it('returns 201 status', async () => {
      const res = await POST(makePostRequest({ title: 'Test' }));

      expect(res.status).toBe(201);
    });
  });
});
