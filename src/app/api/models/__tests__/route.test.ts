import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

vi.mock('@/lib/config/settings', () => ({
  loadSettings: vi.fn(),
}));

import { GET } from '../route';
import { loadSettings } from '@/lib/config/settings';

const mockLoadSettings = vi.mocked(loadSettings);

describe('API /api/models', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns model list from Ollama', async () => {
    mockLoadSettings.mockResolvedValue({ ollamaUrl: 'http://localhost:11434' } as never);
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        models: [
          { name: 'llama3' },
          { name: 'mistral' },
          { name: 'codellama' },
        ],
      }),
    });

    const res = await GET();
    const json = await res.json();

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:11434/api/tags',
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
    expect(json.models).toEqual(['llama3', 'mistral', 'codellama']);
  });

  it('returns empty array when fetch fails', async () => {
    mockLoadSettings.mockResolvedValue({ ollamaUrl: 'http://localhost:11434' } as never);
    mockFetch.mockRejectedValue(new Error('Connection refused'));

    const res = await GET();
    const json = await res.json();

    expect(json.models).toEqual([]);
  });

  it('returns empty array on non-ok response', async () => {
    mockLoadSettings.mockResolvedValue({ ollamaUrl: 'http://localhost:11434' } as never);
    mockFetch.mockResolvedValue({ ok: false, status: 500 });

    const res = await GET();
    const json = await res.json();

    expect(json.models).toEqual([]);
  });
});
