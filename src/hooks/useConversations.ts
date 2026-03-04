'use client';

import { useState, useEffect, useCallback } from 'react';
import { ConversationMeta } from '@/types/conversation';

export function useConversations() {
  const [conversations, setConversations] = useState<ConversationMeta[]>([]);
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

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  return {
    conversations,
    activeId,
    setActiveId,
    searchQuery,
    fetchConversations,
    createConversation,
    deleteConversation,
    renameConversation,
    search,
  };
}
