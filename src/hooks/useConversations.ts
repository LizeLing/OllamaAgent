'use client';

import { useState, useEffect, useCallback } from 'react';
import { ConversationMeta } from '@/types/conversation';
import { FolderMeta } from '@/types/folder';

export interface ConversationWithSnippet extends ConversationMeta {
  matchedSnippet?: string;
  matchType?: 'title' | 'content';
}

export function useConversations() {
  const [conversations, setConversations] = useState<ConversationWithSnippet[]>([]);
  const [folders, setFolders] = useState<FolderMeta[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const fetchConversations = useCallback(async () => {
    try {
      const res = await fetch('/api/conversations');
      if (res.ok) {
        const data = await res.json();
        setConversations(data);
      }
    } catch {
      // fetch failed
    }
  }, []);

  const fetchFolders = useCallback(async () => {
    try {
      const res = await fetch('/api/folders');
      if (res.ok) {
        const data = await res.json();
        setFolders(data);
      }
    } catch {
      // fetch failed
    }
  }, []);

  const createConversation = useCallback(async (title?: string): Promise<string | null> => {
    try {
      const res = await fetch('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title || '새 대화' }),
      });
      if (res.ok) {
        const data = await res.json();
        await fetchConversations();
        setActiveId(data.id);
        return data.id;
      }
    } catch {
      // create failed
    }
    return null;
  }, [fetchConversations]);

  const deleteConversation = useCallback(async (id: string) => {
    try {
      await fetch(`/api/conversations/${id}`, { method: 'DELETE' });
      await fetchConversations();
      if (activeId === id) {
        setActiveId(null);
      }
    } catch {
      // delete failed
    }
  }, [activeId, fetchConversations]);

  const renameConversation = useCallback(async (id: string, title: string) => {
    try {
      await fetch(`/api/conversations/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      });
      await fetchConversations();
    } catch {
      // rename failed
    }
  }, [fetchConversations]);

  const search = useCallback(async (query: string) => {
    setSearchQuery(query);
    if (!query.trim()) {
      await fetchConversations();
      return;
    }
    try {
      const res = await fetch(`/api/conversations/search?q=${encodeURIComponent(query)}`);
      if (res.ok) {
        const data = await res.json();
        setConversations(data);
      }
    } catch {
      // search failed
    }
  }, [fetchConversations]);

  const togglePin = useCallback(async (id: string) => {
    const conv = conversations.find((c) => c.id === id);
    if (!conv) return;
    try {
      await fetch(`/api/conversations/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pinned: !conv.pinned }),
      });
      await fetchConversations();
    } catch {
      // toggle failed
    }
  }, [conversations, fetchConversations]);

  const moveToFolder = useCallback(async (convId: string, folderId: string | null) => {
    try {
      await fetch(`/api/conversations/${convId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderId: folderId || undefined }),
      });
      await fetchConversations();
    } catch {
      // move failed
    }
  }, [fetchConversations]);

  const updateTags = useCallback(async (convId: string, tags: string[]) => {
    try {
      await fetch(`/api/conversations/${convId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tags }),
      });
      await fetchConversations();
    } catch {
      // update failed
    }
  }, [fetchConversations]);

  const createFolder = useCallback(async (name: string, color?: string) => {
    try {
      const res = await fetch('/api/folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, color }),
      });
      if (res.ok) {
        await fetchFolders();
      }
    } catch {
      // create failed
    }
  }, [fetchFolders]);

  const deleteFolder = useCallback(async (folderId: string) => {
    try {
      await fetch(`/api/folders/${folderId}`, { method: 'DELETE' });
      await fetchFolders();
      await fetchConversations();
    } catch {
      // delete failed
    }
  }, [fetchFolders, fetchConversations]);

  const renameFolder = useCallback(async (folderId: string, name: string) => {
    try {
      await fetch(`/api/folders/${folderId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      await fetchFolders();
    } catch {
      // rename failed
    }
  }, [fetchFolders]);

  useEffect(() => {
    fetchConversations();
    fetchFolders();
  }, [fetchConversations, fetchFolders]);

  return {
    conversations,
    folders,
    activeId,
    setActiveId,
    searchQuery,
    fetchConversations,
    createConversation,
    deleteConversation,
    renameConversation,
    search,
    togglePin,
    moveToFolder,
    updateTags,
    createFolder,
    deleteFolder,
    renameFolder,
  };
}
