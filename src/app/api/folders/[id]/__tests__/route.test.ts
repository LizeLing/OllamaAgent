import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/conversations/folders', () => ({
  updateFolder: vi.fn(),
  deleteFolder: vi.fn(),
}));

vi.mock('@/lib/conversations/storage', () => ({
  clearFolderFromConversations: vi.fn(),
}));

import { PUT, DELETE } from '../route';
import { updateFolder, deleteFolder } from '@/lib/conversations/folders';
import { clearFolderFromConversations } from '@/lib/conversations/storage';

const mockUpdateFolder = vi.mocked(updateFolder);
const mockDeleteFolder = vi.mocked(deleteFolder);
const mockClearFolder = vi.mocked(clearFolderFromConversations);

describe('API /api/folders/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('PUT', () => {
    it('updates folder successfully', async () => {
      const updatedFolder = { id: 'folder-1', name: 'Updated', color: '#00ff00' };
      mockUpdateFolder.mockResolvedValue(updatedFolder as never);

      const req = new NextRequest('http://localhost/api/folders/folder-1', {
        method: 'PUT',
        body: JSON.stringify({ name: 'Updated', color: '#00ff00' }),
      });

      const res = await PUT(req, { params: Promise.resolve({ id: 'folder-1' }) });
      const json = await res.json();

      expect(mockUpdateFolder).toHaveBeenCalledWith('folder-1', { name: 'Updated', color: '#00ff00' });
      expect(json).toEqual(updatedFolder);
    });

    it('returns 404 when folder not found', async () => {
      mockUpdateFolder.mockResolvedValue(null as never);

      const req = new NextRequest('http://localhost/api/folders/nonexistent', {
        method: 'PUT',
        body: JSON.stringify({ name: 'Updated' }),
      });

      const res = await PUT(req, { params: Promise.resolve({ id: 'nonexistent' }) });
      const json = await res.json();

      expect(res.status).toBe(404);
      expect(json.error).toBe('Not found');
    });
  });

  describe('DELETE', () => {
    it('deletes folder and clears conversations', async () => {
      mockClearFolder.mockResolvedValue(undefined as never);
      mockDeleteFolder.mockResolvedValue(undefined as never);

      const req = new NextRequest('http://localhost/api/folders/folder-1', {
        method: 'DELETE',
      });

      const res = await DELETE(req, { params: Promise.resolve({ id: 'folder-1' }) });
      const json = await res.json();

      expect(mockClearFolder).toHaveBeenCalledWith('folder-1');
      expect(mockDeleteFolder).toHaveBeenCalledWith('folder-1');
      expect(json).toEqual({ success: true });
    });

    it('returns success response', async () => {
      mockClearFolder.mockResolvedValue(undefined as never);
      mockDeleteFolder.mockResolvedValue(undefined as never);

      const req = new NextRequest('http://localhost/api/folders/folder-2', {
        method: 'DELETE',
      });

      const res = await DELETE(req, { params: Promise.resolve({ id: 'folder-2' }) });

      expect(res.status).toBe(200);
    });
  });
});
