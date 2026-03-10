import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/memory/vector-store', () => ({
  deleteVector: vi.fn().mockResolvedValue(undefined),
}));

import { DELETE } from '../bulk/route';
import { deleteVector } from '@/lib/memory/vector-store';

describe('DELETE /api/memory/bulk', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('여러 id를 일괄 삭제한다', async () => {
    const req = new Request('http://localhost/api/memory/bulk', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: ['id-1', 'id-2', 'id-3'] }),
    });
    const res = await DELETE(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.deleted).toBe(3);
    expect(deleteVector).toHaveBeenCalledTimes(3);
  });

  it('ids가 비어있으면 400을 반환한다', async () => {
    const req = new Request('http://localhost/api/memory/bulk', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [] }),
    });
    const res = await DELETE(req);

    expect(res.status).toBe(400);
  });
});
