import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/config/settings', () => ({
  loadSettings: vi.fn(),
  saveSettings: vi.fn(),
}));

vi.mock('uuid', () => ({
  v4: vi.fn(() => 'test-tool-id'),
}));

import { GET, POST, DELETE } from '../route';
import { loadSettings, saveSettings } from '@/lib/config/settings';

const mockLoadSettings = vi.mocked(loadSettings);
const mockSaveSettings = vi.mocked(saveSettings);

describe('API /api/custom-tools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET', () => {
    it('returns custom tools list', async () => {
      const tools = [
        { id: 'tool-1', name: 'My Tool', description: 'A tool', url: 'http://example.com', method: 'GET', parameters: [] },
      ];
      mockLoadSettings.mockResolvedValue({ customTools: tools } as never);

      const res = await GET();
      const json = await res.json();

      expect(json.customTools).toEqual(tools);
    });

    it('returns empty array when no custom tools', async () => {
      mockLoadSettings.mockResolvedValue({} as never);

      const res = await GET();
      const json = await res.json();

      expect(json.customTools).toEqual([]);
    });
  });

  describe('POST', () => {
    it('creates a new custom tool', async () => {
      mockLoadSettings.mockResolvedValue({ customTools: [] } as never);
      mockSaveSettings.mockResolvedValue(undefined as never);

      const body = {
        name: 'Weather API',
        description: 'Get weather data',
        url: 'http://api.weather.com',
        method: 'GET',
        parameters: [],
      };

      const req = new NextRequest('http://localhost/api/custom-tools', {
        method: 'POST',
        body: JSON.stringify(body),
      });

      const res = await POST(req);
      const json = await res.json();

      expect(json.tool.id).toBe('test-tool-id');
      expect(json.tool.name).toBe('Weather API');
      expect(mockSaveSettings).toHaveBeenCalledWith({
        customTools: [expect.objectContaining({ id: 'test-tool-id', name: 'Weather API' })],
      });
    });
  });

  describe('DELETE', () => {
    it('removes a custom tool', async () => {
      const tools = [
        { id: 'tool-1', name: 'Tool 1', description: 'D1', url: 'http://a.com', method: 'GET', parameters: [] },
        { id: 'tool-2', name: 'Tool 2', description: 'D2', url: 'http://b.com', method: 'POST', parameters: [] },
      ];
      mockLoadSettings.mockResolvedValue({ customTools: tools } as never);
      mockSaveSettings.mockResolvedValue(undefined as never);

      const req = new NextRequest('http://localhost/api/custom-tools', {
        method: 'DELETE',
        body: JSON.stringify({ id: 'tool-1' }),
      });

      const res = await DELETE(req);
      const json = await res.json();

      expect(json.success).toBe(true);
      expect(mockSaveSettings).toHaveBeenCalledWith({
        customTools: [expect.objectContaining({ id: 'tool-2' })],
      });
    });
  });
});
