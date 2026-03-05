'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { ConversationMeta } from '@/types/conversation';
import { FolderMeta } from '@/types/folder';
import { addToast } from '@/hooks/useToast';

export interface ConversationWithSnippet extends ConversationMeta {
  matchedSnippet?: string;
  matchType?: 'title' | 'content';
}

const searchCache = new Map<string, { data: ConversationWithSnippet[]; timestamp: number }>();
const CACHE_TTL = 30_000; // 30 seconds

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
        searchCache.clear(); // Invalidate cache on data change
      }
    } catch (err) {
      console.error('[fetchConversations]', err);
    }
  }, []);

  const fetchFolders = useCallback(async () => {
    try {
      const res = await fetch('/api/folders');
      if (res.ok) {
        const data = await res.json();
        setFolders(data);
      }
    } catch (err) {
      console.error('[fetchFolders]', err);
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
    } catch (err) {
      console.error('[createConversation]', err);
      addToast('error', '대화 생성에 실패했습니다.');
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
    } catch (err) {
      console.error('[deleteConversation]', err);
      addToast('error', '대화 삭제에 실패했습니다.');
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
    } catch (err) {
      console.error('[renameConversation]', err);
      addToast('error', '이름 변경에 실패했습니다.');
    }
  }, [fetchConversations]);

  const search = useCallback(async (query: string) => {
    setSearchQuery(query);
    if (!query.trim()) {
      await fetchConversations();
      return;
    }

    // Check cache
    const cached = searchCache.get(query);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      setConversations(cached.data);
      return;
    }

    try {
      const res = await fetch(`/api/conversations/search?q=${encodeURIComponent(query)}`);
      if (res.ok) {
        const data = await res.json();
        setConversations(data);
        searchCache.set(query, { data, timestamp: Date.now() });

        // Limit cache size
        if (searchCache.size > 50) {
          const oldest = Array.from(searchCache.entries())
            .sort((a, b) => a[1].timestamp - b[1].timestamp)[0];
          if (oldest) searchCache.delete(oldest[0]);
        }
      }
    } catch (err) {
      console.error('[search]', err);
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
    } catch (err) {
      console.error('[togglePin]', err);
      addToast('error', '고정 변경에 실패했습니다.');
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
    } catch (err) {
      console.error('[moveToFolder]', err);
      addToast('error', '폴더 이동에 실패했습니다.');
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
    } catch (err) {
      console.error('[updateTags]', err);
      addToast('error', '태그 업데이트에 실패했습니다.');
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
    } catch (err) {
      console.error('[createFolder]', err);
      addToast('error', '폴더 생성에 실패했습니다.');
    }
  }, [fetchFolders]);

  const deleteFolder = useCallback(async (folderId: string) => {
    try {
      await fetch(`/api/folders/${folderId}`, { method: 'DELETE' });
      await fetchFolders();
      await fetchConversations();
    } catch (err) {
      console.error('[deleteFolder]', err);
      addToast('error', '폴더 삭제에 실패했습니다.');
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
    } catch (err) {
      console.error('[renameFolder]', err);
      addToast('error', '폴더 이름 변경에 실패했습니다.');
    }
  }, [fetchFolders]);

  const initializedRef = useRef(false);
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    fetchConversations();
    fetchFolders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
