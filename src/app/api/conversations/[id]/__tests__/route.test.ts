import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks (must be declared BEFORE importing the route) ──

vi.mock('@/lib/conversations/storage', () => ({
  getConversation: vi.fn(),
  saveConversation: vi.fn(() => Promise.resolve()),
  deleteConversation: vi.fn(() => Promise.resolve()),
}));

// ── Imports (after mocks) ──

import { NextRequest } from 'next/server';
import { GET, PUT, DELETE } from '../route';
import {
  getConversation,
  saveConversation,
  deleteConversation,
} from '@/lib/conversations/storage';

// ── Helpers ──

const mockConversation = {
  id: 'conv-1',
  title: 'Test Conversation',
  createdAt: 1000,
  updatedAt: 1000,
  messageCount: 2,
  messages: [
    { role: 'user', content: 'hi', timestamp: 1000 },
    { role: 'assistant', content: 'hello', timestamp: 1001 },
  ],
};

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

function makeRequest(
  method: string,
  body?: Record<string, unknown>,
): NextRequest {
  const init: RequestInit = { method };
  if (body) {
    init.headers = { 'Content-Type': 'application/json' };
    init.body = JSON.stringify(body);
  }
  return new NextRequest('http://localhost:3000/api/conversations/conv-1', init);
}

// ── Tests ──

describe('/api/conversations/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET', () => {
    it('returns conversation by id', async () => {
      vi.mocked(getConversation).mockResolvedValue(mockConversation);

      const res = await GET(
        makeRequest('GET'),
        makeParams('conv-1'),
      );
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.id).toBe('conv-1');
      expect(getConversation).toHaveBeenCalledWith('conv-1');
    });

    it('returns 404 when conversation not found', async () => {
      vi.mocked(getConversation).mockResolvedValue(null);

      const res = await GET(
        makeRequest('GET'),
        makeParams('nonexistent'),
      );

      expect(res.status).toBe(404);
    });
  });

  describe('PUT', () => {
    it('updates conversation', async () => {
      vi.mocked(getConversation).mockResolvedValue(mockConversation);

      const res = await PUT(
        makeRequest('PUT', { title: 'Updated Title' }),
        makeParams('conv-1'),
      );
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.title).toBe('Updated Title');
      expect(saveConversation).toHaveBeenCalled();
    });

    it('returns 404 when conversation not found', async () => {
      vi.mocked(getConversation).mockResolvedValue(null);

      const res = await PUT(
        makeRequest('PUT', { title: 'Updated' }),
        makeParams('nonexistent'),
      );

      expect(res.status).toBe(404);
    });

    it('prevents id override', async () => {
      vi.mocked(getConversation).mockResolvedValue(mockConversation);

      const res = await PUT(
        makeRequest('PUT', { id: 'hacked-id', title: 'Updated' }),
        makeParams('conv-1'),
      );
      const body = await res.json();

      expect(body.id).toBe('conv-1');
    });
  });

  describe('DELETE', () => {
    it('deletes conversation', async () => {
      const res = await DELETE(
        makeRequest('DELETE'),
        makeParams('conv-1'),
      );
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(deleteConversation).toHaveBeenCalledWith('conv-1');
    });
  });
});
