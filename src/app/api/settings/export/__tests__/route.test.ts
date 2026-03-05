import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/config/settings', () => ({
  loadSettings: vi.fn(),
}));

import { GET } from '../route';
import { loadSettings } from '@/lib/config/settings';

const mockLoadSettings = vi.mocked(loadSettings);

describe('API /api/settings/export', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns settings JSON with version and exportedAt', async () => {
    const settings = { ollamaUrl: 'http://localhost:11434', ollamaModel: 'llama3' };
    mockLoadSettings.mockResolvedValue(settings as never);

    const res = await GET();
    const text = await res.text();
    const json = JSON.parse(text);

    expect(json.version).toBe(1);
    expect(json.exportedAt).toBeDefined();
    expect(json.settings).toEqual(settings);
  });

  it('has Content-Disposition header for file download', async () => {
    const settings = { ollamaUrl: 'http://localhost:11434' };
    mockLoadSettings.mockResolvedValue(settings as never);

    const res = await GET();

    expect(res.headers.get('Content-Disposition')).toBe(
      'attachment; filename="ollamaagent-settings.json"'
    );
    expect(res.headers.get('Content-Type')).toBe('application/json');
  });
});
