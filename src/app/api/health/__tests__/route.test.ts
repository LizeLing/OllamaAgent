import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

vi.mock('@/lib/config/settings', () => ({
  loadSettings: vi.fn(),
}));

vi.mock('@/lib/ollama/client', () => ({
  checkHealth: vi.fn(),
}));

import { GET } from '../route';
import { loadSettings } from '@/lib/config/settings';
import { checkHealth } from '@/lib/ollama/client';

const mockLoadSettings = vi.mocked(loadSettings);
const mockCheckHealth = vi.mocked(checkHealth);

describe('API /api/health', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns all services healthy', async () => {
    mockLoadSettings.mockResolvedValue({
      ollamaUrl: 'http://localhost:11434',
      searxngUrl: 'http://localhost:8080',
      embeddingModel: 'nomic-embed-text',
    } as never);

    mockCheckHealth.mockResolvedValue(true as never);

    // searxng healthz
    mockFetch.mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('/healthz')) {
        return Promise.resolve({ ok: true });
      }
      if (typeof url === 'string' && url.includes('_ping')) {
        return Promise.resolve({ ok: true });
      }
      if (typeof url === 'string' && url.includes('/api/embed')) {
        return Promise.resolve({ ok: true });
      }
      return Promise.resolve({ ok: false });
    });

    const res = await GET();
    const json = await res.json();

    expect(json.ollama).toBe(true);
    expect(json.searxng).toBe(true);
    expect(json.embedding).toBe(true);
    expect(json.stt).toBe(false);
    expect(json.tts).toBe(false);
  });

  it('returns ollama unavailable', async () => {
    mockLoadSettings.mockResolvedValue({
      ollamaUrl: 'http://localhost:11434',
      searxngUrl: 'http://localhost:8080',
      embeddingModel: 'nomic-embed-text',
    } as never);

    mockCheckHealth.mockResolvedValue(false as never);
    mockFetch.mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('/healthz')) {
        return Promise.resolve({ ok: false });
      }
      if (typeof url === 'string' && url.includes('_ping')) {
        return Promise.reject(new Error('connection refused'));
      }
      return Promise.resolve({ ok: false });
    });

    const res = await GET();
    const json = await res.json();

    expect(json.ollama).toBe(false);
    // embedding should be false when ollama is down
    expect(json.embedding).toBe(false);
  });

  it('returns correct health status structure', async () => {
    mockLoadSettings.mockResolvedValue({
      ollamaUrl: 'http://localhost:11434',
      searxngUrl: 'http://localhost:8080',
      embeddingModel: 'nomic-embed-text',
    } as never);

    mockCheckHealth.mockResolvedValue(true as never);
    mockFetch.mockImplementation(() => Promise.resolve({ ok: false }));

    const res = await GET();
    const json = await res.json();

    expect(json).toHaveProperty('ollama');
    expect(json).toHaveProperty('searxng');
    expect(json).toHaveProperty('docker');
    expect(json).toHaveProperty('embedding');
    expect(json).toHaveProperty('stt');
    expect(json).toHaveProperty('tts');
  });
});
