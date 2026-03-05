import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks (must be declared BEFORE importing the route) ──

vi.mock('@/lib/conversations/storage', () => ({
  saveConversation: vi.fn(() => Promise.resolve()),
}));

vi.mock('uuid', () => ({
  v4: vi.fn(() => 'test-uuid'),
}));

// ── Imports (after mocks) ──

import { NextRequest } from 'next/server';
import { POST } from '../route';
import { saveConversation } from '@/lib/conversations/storage';

// ── Helpers ──

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost:3000/api/conversations/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// ── Tests ──

describe('POST /api/conversations/import', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('imports a valid conversation', async () => {
    const messages = [
      { role: 'user', content: 'hi', timestamp: 1000 },
      { role: 'assistant', content: 'hello', timestamp: 1001 },
    ];

    const res = await POST(makeRequest({ title: 'Imported Chat', messages }));
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.id).toBe('test-uuid');
    expect(body.title).toBe('Imported Chat');
    expect(body.messages).toHaveLength(2);
    expect(saveConversation).toHaveBeenCalled();
  });

  it('uses default title when not provided', async () => {
    const messages = [{ role: 'user', content: 'test', timestamp: 1000 }];

    const res = await POST(makeRequest({ messages }));
    const body = await res.json();

    expect(body.title).toBe('가져온 대화');
  });

  it('filters out invalid messages', async () => {
    const messages = [
      { role: 'user', content: 'valid', timestamp: 1000 },
      { role: 'system', content: 'invalid role' },
      { content: 'no role' },
      null,
      42,
      { role: 'assistant', content: 'also valid', timestamp: 2000 },
    ];

    const res = await POST(makeRequest({ title: 'Test', messages }));
    const body = await res.json();

    expect(body.messages).toHaveLength(2);
    expect(body.messages[0].role).toBe('user');
    expect(body.messages[1].role).toBe('assistant');
  });

  it('limits messages to 1000', async () => {
    const messages = Array.from({ length: 1500 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `message ${i}`,
      timestamp: i,
    }));

    const res = await POST(makeRequest({ title: 'Big', messages }));
    const body = await res.json();

    expect(body.messages).toHaveLength(1000);
    expect(body.messageCount).toBe(1000);
  });

  it('returns 500 for invalid JSON body', async () => {
    const req = new NextRequest('http://localhost:3000/api/conversations/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not json{{{{',
    });

    const res = await POST(req);

    expect(res.status).toBe(500);
  });
});
