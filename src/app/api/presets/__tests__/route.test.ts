import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/presets/storage', () => ({
  listPresets: vi.fn(),
  savePreset: vi.fn(),
}));

vi.mock('uuid', () => ({
  v4: vi.fn(() => 'test-uuid'),
}));

import { GET, POST } from '../route';
import { listPresets, savePreset } from '@/lib/presets/storage';

const mockListPresets = vi.mocked(listPresets);
const mockSavePreset = vi.mocked(savePreset);

describe('API /api/presets', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET', () => {
    it('returns all presets', async () => {
      const presets = [
        { id: '1', name: 'Default', systemPrompt: 'You are helpful', enabledTools: [] },
      ];
      mockListPresets.mockResolvedValue(presets as never);

      const res = await GET();
      const json = await res.json();

      expect(mockListPresets).toHaveBeenCalled();
      expect(json).toEqual({ presets });
    });
  });

  describe('POST', () => {
    it('creates a new preset', async () => {
      mockSavePreset.mockResolvedValue(undefined as never);

      const body = {
        name: 'Coder',
        systemPrompt: 'You are a coder',
        enabledTools: ['shell'],
        model: 'llama3',
      };

      const req = new NextRequest('http://localhost/api/presets', {
        method: 'POST',
        body: JSON.stringify(body),
      });

      const res = await POST(req);
      const json = await res.json();

      expect(mockSavePreset).toHaveBeenCalled();
      expect(json.preset.id).toBe('test-uuid');
      expect(json.preset.name).toBe('Coder');
    });

    it('creates preset with correct fields', async () => {
      mockSavePreset.mockResolvedValue(undefined as never);

      const body = {
        name: 'Writer',
        systemPrompt: 'You are a writer',
        model: 'mistral',
      };

      const req = new NextRequest('http://localhost/api/presets', {
        method: 'POST',
        body: JSON.stringify(body),
      });

      const res = await POST(req);
      const json = await res.json();

      expect(json.preset).toEqual({
        id: 'test-uuid',
        name: 'Writer',
        systemPrompt: 'You are a writer',
        enabledTools: [],
        model: 'mistral',
      });
    });
  });
});
