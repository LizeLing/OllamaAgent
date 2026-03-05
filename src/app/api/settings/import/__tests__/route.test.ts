import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/config/settings', () => ({
  loadSettings: vi.fn(),
  saveSettings: vi.fn(),
}));

import { POST } from '../route';
import { loadSettings, saveSettings } from '@/lib/config/settings';

const mockLoadSettings = vi.mocked(loadSettings);
const mockSaveSettings = vi.mocked(saveSettings);

function makeRequest(body: unknown) {
  return new NextRequest('http://localhost/api/settings/import', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

describe('API /api/settings/import', () => {
  const currentSettings = {
    ollamaUrl: 'http://localhost:11434',
    ollamaModel: 'llama3',
    systemPrompt: 'old prompt',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockLoadSettings.mockResolvedValue(currentSettings as never);
    mockSaveSettings.mockResolvedValue(undefined as never);
  });

  it('imports settings with settings wrapper', async () => {
    const importData = {
      version: 1,
      settings: { systemPrompt: 'new prompt', ollamaModel: 'mistral' },
    };

    const res = await POST(makeRequest(importData));
    const json = await res.json();

    expect(json.success).toBe(true);
    expect(mockSaveSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        systemPrompt: 'new prompt',
        ollamaModel: 'mistral',
      })
    );
  });

  it('imports settings directly without wrapper', async () => {
    const importData = { systemPrompt: 'direct prompt' };

    const res = await POST(makeRequest(importData));
    const json = await res.json();

    expect(json.success).toBe(true);
    expect(mockSaveSettings).toHaveBeenCalledWith(
      expect.objectContaining({ systemPrompt: 'direct prompt' })
    );
  });

  it('returns 400 for invalid body', async () => {
    const req = new NextRequest('http://localhost/api/settings/import', {
      method: 'POST',
      body: JSON.stringify(null),
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe('Invalid import data');
  });

  it('only merges allowed keys', async () => {
    const importData = {
      systemPrompt: 'allowed',
      ollamaUrl: 'http://new-url:11434',
      __dangerousKey: 'should be ignored',
      notAllowed: true,
    };

    await POST(makeRequest(importData));

    expect(mockSaveSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        systemPrompt: 'allowed',
        ollamaUrl: 'http://new-url:11434',
      })
    );

    const savedArg = mockSaveSettings.mock.calls[0][0] as Record<string, unknown>;
    expect(savedArg).not.toHaveProperty('__dangerousKey');
    expect(savedArg).not.toHaveProperty('notAllowed');
  });
});
