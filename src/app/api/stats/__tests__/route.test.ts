import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/conversations/storage', () => ({
  readIndex: vi.fn(),
}));

vi.mock('@/lib/memory/vector-store', () => ({
  getMemoryCount: vi.fn(),
}));

import { GET } from '../route';
import { readIndex } from '@/lib/conversations/storage';
import { getMemoryCount } from '@/lib/memory/vector-store';

const mockReadIndex = vi.mocked(readIndex);
const mockGetMemoryCount = vi.mocked(getMemoryCount);

describe('API /api/stats', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns correct stats', async () => {
    const now = Date.now();
    const conversations = [
      { id: '1', title: 'Chat 1', messageCount: 5, pinned: true, tags: ['work'], updatedAt: now, createdAt: now },
      { id: '2', title: 'Chat 2', messageCount: 3, pinned: false, tags: ['personal'], updatedAt: now, createdAt: now },
    ];
    mockReadIndex.mockResolvedValue(conversations as never);
    mockGetMemoryCount.mockResolvedValue(10 as never);

    const res = await GET();
    const json = await res.json();

    expect(json.totalConversations).toBe(2);
    expect(json.totalMessages).toBe(8);
    expect(json.pinnedCount).toBe(1);
    expect(json.memoryCount).toBe(10);
    expect(json.tagCounts).toBeDefined();
    expect(json.dailyActivity).toBeDefined();
  });

  it('returns empty stats for no conversations', async () => {
    mockReadIndex.mockResolvedValue([] as never);
    mockGetMemoryCount.mockResolvedValue(0 as never);

    const res = await GET();
    const json = await res.json();

    expect(json.totalConversations).toBe(0);
    expect(json.totalMessages).toBe(0);
    expect(json.pinnedCount).toBe(0);
    expect(json.memoryCount).toBe(0);
    expect(json.tagCounts).toEqual({});
  });

  it('counts tags correctly', async () => {
    const now = Date.now();
    const conversations = [
      { id: '1', title: 'Chat 1', messageCount: 1, pinned: false, tags: ['work', 'coding'], updatedAt: now, createdAt: now },
      { id: '2', title: 'Chat 2', messageCount: 1, pinned: false, tags: ['work'], updatedAt: now, createdAt: now },
      { id: '3', title: 'Chat 3', messageCount: 1, pinned: false, tags: ['personal'], updatedAt: now, createdAt: now },
    ];
    mockReadIndex.mockResolvedValue(conversations as never);
    mockGetMemoryCount.mockResolvedValue(0 as never);

    const res = await GET();
    const json = await res.json();

    expect(json.tagCounts).toEqual({ work: 2, coding: 1, personal: 1 });
  });

  it('returns 500 on error', async () => {
    mockReadIndex.mockRejectedValue(new Error('File not found'));

    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.error).toBe('Failed to get stats');
  });
});
