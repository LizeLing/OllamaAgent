import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks (must be declared BEFORE importing the route) ──

vi.mock('@/lib/agent/approval', () => ({
  resolveApproval: vi.fn(),
}));

// ── Imports (after mocks) ──

import { NextRequest } from 'next/server';
import { POST } from '../route';
import { resolveApproval } from '@/lib/agent/approval';

// ── Helpers ──

function makeRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost:3000/api/chat/confirm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// ── Tests ──

describe('POST /api/chat/confirm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns success when approval is resolved', async () => {
    vi.mocked(resolveApproval).mockReturnValue(true);

    const res = await POST(makeRequest({ confirmId: 'abc-123', approved: true }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(resolveApproval).toHaveBeenCalledWith('abc-123', true);
  });

  it('returns success when denial is resolved', async () => {
    vi.mocked(resolveApproval).mockReturnValue(true);

    const res = await POST(makeRequest({ confirmId: 'abc-123', approved: false }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(resolveApproval).toHaveBeenCalledWith('abc-123', false);
  });

  it('returns 400 when confirmId is missing', async () => {
    const res = await POST(makeRequest({ approved: true }));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Invalid confirmId');
  });

  it('returns 400 when approved is not a boolean', async () => {
    const res = await POST(makeRequest({ confirmId: 'abc', approved: 'yes' }));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Invalid approved value');
  });

  it('returns 404 when approval is not found', async () => {
    vi.mocked(resolveApproval).mockReturnValue(false);

    const res = await POST(makeRequest({ confirmId: 'nonexistent', approved: true }));

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toContain('not found');
  });
});
