import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/presets/storage', () => ({
  getPreset: vi.fn(),
  savePreset: vi.fn(),
  deletePreset: vi.fn(),
}));

import { GET, PUT, DELETE } from '../route';
import { getPreset, savePreset, deletePreset } from '@/lib/presets/storage';

const mockGetPreset = vi.mocked(getPreset);
const mockSavePreset = vi.mocked(savePreset);
const mockDeletePreset = vi.mocked(deletePreset);

describe('API /api/presets/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET', () => {
    it('returns preset by id', async () => {
      const preset = { id: 'preset-1', name: 'Default', systemPrompt: 'Hello', enabledTools: [] };
      mockGetPreset.mockResolvedValue(preset as never);

      const req = new NextRequest('http://localhost/api/presets/preset-1');
      const res = await GET(req, { params: Promise.resolve({ id: 'preset-1' }) });
      const json = await res.json();

      expect(mockGetPreset).toHaveBeenCalledWith('preset-1');
      expect(json).toEqual({ preset });
    });

    it('returns 404 when preset not found', async () => {
      mockGetPreset.mockResolvedValue(null as never);

      const req = new NextRequest('http://localhost/api/presets/nonexistent');
      const res = await GET(req, { params: Promise.resolve({ id: 'nonexistent' }) });
      const json = await res.json();

      expect(res.status).toBe(404);
      expect(json.error).toBe('Not found');
    });
  });

  describe('PUT', () => {
    it('updates preset', async () => {
      mockSavePreset.mockResolvedValue(undefined as never);

      const body = { name: 'Updated', systemPrompt: 'New prompt', enabledTools: ['shell'] };
      const req = new NextRequest('http://localhost/api/presets/preset-1', {
        method: 'PUT',
        body: JSON.stringify(body),
      });

      const res = await PUT(req, { params: Promise.resolve({ id: 'preset-1' }) });
      const json = await res.json();

      expect(mockSavePreset).toHaveBeenCalledWith({ ...body, id: 'preset-1' });
      expect(json.preset).toEqual({ ...body, id: 'preset-1' });
    });
  });

  describe('DELETE', () => {
    it('deletes preset successfully', async () => {
      mockDeletePreset.mockResolvedValue(true as never);

      const req = new NextRequest('http://localhost/api/presets/preset-1', { method: 'DELETE' });
      const res = await DELETE(req, { params: Promise.resolve({ id: 'preset-1' }) });
      const json = await res.json();

      expect(mockDeletePreset).toHaveBeenCalledWith('preset-1');
      expect(json).toEqual({ success: true });
    });

    it('returns 400 for default preset', async () => {
      mockDeletePreset.mockResolvedValue(false as never);

      const req = new NextRequest('http://localhost/api/presets/default', { method: 'DELETE' });
      const res = await DELETE(req, { params: Promise.resolve({ id: 'default' }) });
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.error).toBeDefined();
    });
  });
});
