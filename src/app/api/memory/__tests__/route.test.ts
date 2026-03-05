import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/memory/vector-store', () => ({
  getMemoryCount: vi.fn(),
  purgeExpiredMemories: vi.fn(),
}));

import { GET, DELETE } from '../route';
import { getMemoryCount, purgeExpiredMemories } from '@/lib/memory/vector-store';

const mockGetMemoryCount = vi.mocked(getMemoryCount);
const mockPurgeExpired = vi.mocked(purgeExpiredMemories);

describe('API /api/memory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET', () => {
    it('returns memory count', async () => {
      mockGetMemoryCount.mockResolvedValue(42 as never);

      const res = await GET();
      const json = await res.json();

      expect(mockGetMemoryCount).toHaveBeenCalled();
      expect(json).toEqual({ count: 42 });
    });

    it('returns 500 on error', async () => {
      mockGetMemoryCount.mockRejectedValue(new Error('DB error'));

      const res = await GET();
      const json = await res.json();

      expect(res.status).toBe(500);
      expect(json.error).toBe('Failed to get memory count');
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
