import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/memory/vector-store', () => ({
  getMemoryCount: vi.fn(),
  getMemoryList: vi.fn(),
  purgeExpiredMemories: vi.fn(),
}));

import { GET, DELETE } from '../route';
import { getMemoryCount, getMemoryList, purgeExpiredMemories } from '@/lib/memory/vector-store';

const mockGetMemoryCount = vi.mocked(getMemoryCount);
const mockGetMemoryList = vi.mocked(getMemoryList);
const mockPurgeExpired = vi.mocked(purgeExpiredMemories);

describe('API /api/memory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET', () => {
    it('returns memory count', async () => {
      mockGetMemoryCount.mockResolvedValue(42 as never);

      const res = await GET(new Request('http://localhost/api/memory'));
      const json = await res.json();

      expect(mockGetMemoryCount).toHaveBeenCalled();
      expect(json).toEqual({ count: 42 });
    });

    it('returns 500 on error', async () => {
      mockGetMemoryCount.mockRejectedValue(new Error('DB error'));

      const res = await GET(new Request('http://localhost/api/memory'));
      const json = await res.json();

      expect(res.status).toBe(500);
      expect(json.error).toBe('Failed to get memories');
    });
  });

  describe('GET /api/memory?list=true', () => {
    it('list=true이면 페이지네이션된 메모리 목록을 반환한다', async () => {
      mockGetMemoryList.mockResolvedValue({
        items: [], total: 0, page: 1, limit: 20,
      } as never);

      const req = new Request('http://localhost/api/memory?list=true&page=1&limit=20');
      const res = await GET(req);
      const data = await res.json();

      expect(mockGetMemoryList).toHaveBeenCalledWith({ page: 1, limit: 20, category: undefined });
      expect(data).toHaveProperty('items');
      expect(data).toHaveProperty('total');
      expect(data).toHaveProperty('page');
    });

    it('category 파라미터로 필터링한다', async () => {
      mockGetMemoryList.mockResolvedValue({
        items: [], total: 0, page: 1, limit: 20,
      } as never);

      const req = new Request('http://localhost/api/memory?list=true&category=technical');
      const res = await GET(req);

      expect(mockGetMemoryList).toHaveBeenCalledWith(
        expect.objectContaining({ category: 'technical' })
      );
    });

    it('list 파라미터 없으면 기존 count만 반환한다', async () => {
      mockGetMemoryCount.mockResolvedValue(42 as never);

      const req = new Request('http://localhost/api/memory');
      const res = await GET(req);
      const data = await res.json();

      expect(data).toHaveProperty('count');
      expect(data).not.toHaveProperty('items');
    });
  });

  describe('DELETE', () => {
    it('purges expired memories', async () => {
      mockPurgeExpired.mockResolvedValue(5 as never);
      mockGetMemoryCount.mockResolvedValue(37 as never);

      const req = new Request('http://localhost/api/memory?maxAgeDays=7&maxCount=500');

      const res = await DELETE(req);
      const json = await res.json();

      expect(mockPurgeExpired).toHaveBeenCalledWith(7, 500);
      expect(json).toEqual({ deleted: 5, remaining: 37 });
    });
  });
});
