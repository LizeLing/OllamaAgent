import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/conversations/folders', () => ({
  listFolders: vi.fn(),
  createFolder: vi.fn(),
}));

import { GET, POST } from '../route';
import { listFolders, createFolder } from '@/lib/conversations/folders';

const mockListFolders = vi.mocked(listFolders);
const mockCreateFolder = vi.mocked(createFolder);

describe('API /api/folders', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET', () => {
    it('returns folder list', async () => {
      const folders = [
        { id: '1', name: 'Work', color: '#ff0000' },
        { id: '2', name: 'Personal', color: '#00ff00' },
      ];
      mockListFolders.mockResolvedValue(folders as never);

      const res = await GET();
      const json = await res.json();

      expect(mockListFolders).toHaveBeenCalled();
      expect(json).toEqual(folders);
    });
  });

  describe('POST', () => {
    it('creates folder with name and color', async () => {
      const folder = { id: '1', name: 'Work', color: '#ff0000' };
      mockCreateFolder.mockResolvedValue(folder as never);

      const req = new NextRequest('http://localhost/api/folders', {
        method: 'POST',
        body: JSON.stringify({ name: 'Work', color: '#ff0000' }),
      });

      const res = await POST(req);
      const json = await res.json();

      expect(res.status).toBe(201);
      expect(mockCreateFolder).toHaveBeenCalledWith('Work', '#ff0000');
      expect(json).toEqual(folder);
    });

    it('uses default color when not provided', async () => {
      const folder = { id: '1', name: 'Work', color: '#6366f1' };
      mockCreateFolder.mockResolvedValue(folder as never);

      const req = new NextRequest('http://localhost/api/folders', {
        method: 'POST',
        body: JSON.stringify({ name: 'Work' }),
      });

      await POST(req);

      expect(mockCreateFolder).toHaveBeenCalledWith('Work', '#6366f1');
    });

    it('returns 400 when name is missing', async () => {
      const req = new NextRequest('http://localhost/api/folders', {
        method: 'POST',
        body: JSON.stringify({}),
      });

      const res = await POST(req);
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.error).toBe('Name is required');
    });
  });
});
