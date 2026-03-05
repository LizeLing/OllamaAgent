import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useSettings } from '../useSettings';

const mockSettings = {
  systemPrompt: 'test',
  maxIterations: 10,
  ollamaUrl: 'http://localhost:11434',
  ollamaModel: 'qwen:7b',
  modelOptions: { temperature: 0.7, topP: 0.9, numPredict: 2048 },
};

beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(mockSettings),
  });
});

describe('useSettings', () => {
  it('loads settings on mount', async () => {
    const { result } = renderHook(() => useSettings());

    await waitFor(() => {
      expect(result.current.settings).not.toBeNull();
    });
    expect(result.current.settings?.ollamaModel).toBe('qwen:7b');
  });

  it('updates settings via PUT', async () => {
    const updated = { ...mockSettings, ollamaModel: 'llama3:8b' };
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockSettings) }) // initial load
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(updated) });     // update

    const { result } = renderHook(() => useSettings());

    await waitFor(() => expect(result.current.settings).not.toBeNull());

    let success: boolean = false;
    await act(async () => {
      success = await result.current.updateSettings({ ollamaModel: 'llama3:8b' });
    });

    expect(success).toBe(true);
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/settings',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ ollamaModel: 'llama3:8b' }),
      })
    );
  });

  it('returns false on update failure', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockSettings) })
      .mockResolvedValueOnce({ ok: false });

    const { result } = renderHook(() => useSettings());
    await waitFor(() => expect(result.current.settings).not.toBeNull());

    let success: boolean = true;
    await act(async () => {
      success = await result.current.updateSettings({ ollamaModel: 'fail' });
    });

    expect(success).toBe(false);
  });

  it('exposes loading state', async () => {
    const { result } = renderHook(() => useSettings());
    // Initially loading
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
  });
});
