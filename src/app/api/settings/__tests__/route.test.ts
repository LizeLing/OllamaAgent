import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/config/settings', () => ({
  loadSettings: vi.fn(),
  saveSettings: vi.fn(),
}));

import { GET, PUT } from '../route';
import { loadSettings, saveSettings } from '@/lib/config/settings';

const mockLoadSettings = vi.mocked(loadSettings);
const mockSaveSettings = vi.mocked(saveSettings);

describe('API /api/settings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET', () => {
    it('returns current settings', async () => {
      const settings = { ollamaUrl: 'http://localhost:11434', ollamaModel: 'llama3' };
      mockLoadSettings.mockResolvedValue(settings as never);

      const res = await GET();
      const json = await res.json();

      expect(mockLoadSettings).toHaveBeenCalled();
      expect(json).toEqual(settings);
    });
  });

  describe('PUT', () => {
    it('updates settings successfully', async () => {
      const body = { ollamaModel: 'mistral' };
      const updated = { ollamaUrl: 'http://localhost:11434', ollamaModel: 'mistral' };
      mockSaveSettings.mockResolvedValue(updated as never);

      const req = new NextRequest('http://localhost/api/settings', {
        method: 'PUT',
        body: JSON.stringify(body),
      });

      const res = await PUT(req);
      const json = await res.json();

      expect(mockSaveSettings).toHaveBeenCalledWith(body);
      expect(json).toEqual(updated);
    });

    it('returns error message on failure', async () => {
      mockSaveSettings.mockRejectedValue(new Error('Disk full'));

      const req = new NextRequest('http://localhost/api/settings', {
        method: 'PUT',
        body: JSON.stringify({ ollamaModel: 'bad' }),
      });

      const res = await PUT(req);
      const json = await res.json();

      expect(res.status).toBe(500);
      expect(json.error).toBe('Internal server error');
    });

    it('returns 500 with generic message on non-Error failure', async () => {
      mockSaveSettings.mockRejectedValue('unknown error');

      const req = new NextRequest('http://localhost/api/settings', {
        method: 'PUT',
        body: JSON.stringify({ ollamaModel: 'bad' }),
      });

      const res = await PUT(req);
      const json = await res.json();

      expect(res.status).toBe(500);
      expect(json.error).toBe('Internal server error');
    });
  });
});
