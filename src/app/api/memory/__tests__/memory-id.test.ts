import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/memory/vector-store', () => ({
  deleteVector: vi.fn().mockResolvedValue(undefined),
}));

import { DELETE } from '../[id]/route';

describe('DELETE /api/memory/[id]', () => {
  it('유효한 id로 메모리를 삭제한다', async () => {
    const req = new Request('http://localhost/api/memory/test-id', { method: 'DELETE' });
    const res = await DELETE(req, { params: Promise.resolve({ id: 'test-id' }) });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.deleted).toBe('test-id');
  });
});
