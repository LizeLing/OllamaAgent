import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useConversations } from '../useConversations';

beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve([]),
  });
});

describe('useConversations', () => {
  it('loads conversation list on mount', async () => {
    const convs = [{ id: 'c1', title: 'Test', createdAt: 0, updatedAt: 0, messageCount: 1 }];
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(convs) })  // conversations
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([]) });     // folders

    const { result } = renderHook(() => useConversations());

    await waitFor(() => {
      expect(result.current.conversations).toHaveLength(1);
    });
    expect(result.current.conversations[0].title).toBe('Test');
  });

  it('creates a conversation', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([]) })   // initial fetch conversations
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([]) })   // initial fetch folders
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ id: 'new-1' }) }) // create
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([]) });  // refetch

    const { result } = renderHook(() => useConversations());
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());

    let newId: string | null = null;
    await act(async () => {
      newId = await result.current.createConversation('New Chat');
    });

    expect(newId).toBe('new-1');
  });

  it('deletes a conversation', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([{ id: 'c1', title: 'X', createdAt: 0, updatedAt: 0, messageCount: 0 }]) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([]) })
      .mockResolvedValue({ ok: true, json: () => Promise.resolve([]) });

    const { result } = renderHook(() => useConversations());
    await waitFor(() => expect(result.current.conversations).toHaveLength(1));

    await act(async () => {
      await result.current.deleteConversation('c1');
    });

    // fetch was called with DELETE
    expect(global.fetch).toHaveBeenCalledWith('/api/conversations/c1', { method: 'DELETE' });
  });

  it('renames a conversation', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve([]) });

    const { result } = renderHook(() => useConversations());
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());

    await act(async () => {
      await result.current.renameConversation('c1', 'New Title');
    });

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/conversations/c1',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ title: 'New Title' }),
      })
    );
  });

  it('searches conversations', async () => {
    const searchResults = [{ id: 'c2', title: 'Found', createdAt: 0, updatedAt: 0, messageCount: 1 }];
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([]) })   // initial conversations
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([]) })   // initial folders
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(searchResults) }); // search

    const { result } = renderHook(() => useConversations());
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());

    await act(async () => {
      await result.current.search('Found');
    });

    expect(result.current.searchQuery).toBe('Found');
    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/api/conversations/search?q=Found'));
  });

  it('creates and manages folders', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve([]) });

    const { result } = renderHook(() => useConversations());
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());

    await act(async () => {
      await result.current.createFolder('Work', '#6366f1');
    });

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/folders',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ name: 'Work', color: '#6366f1' }),
      })
    );
  });
});
