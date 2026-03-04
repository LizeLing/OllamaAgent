'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useChat } from '@/hooks/useChat';
import { useSettings } from '@/hooks/useSettings';
import { useConversations } from '@/hooks/useConversations';
import MessageList from './MessageList';
import ChatInput from './ChatInput';
import SettingsPanel from '@/components/settings/SettingsPanel';
import ThemeToggle from '@/components/ui/ThemeToggle';
import Sidebar from '@/components/sidebar/Sidebar';

export default function ChatContainer() {
  const {
    messages,
    isLoading,
    sendMessage,
    editMessage,
    regenerate,
    stopGeneration,
    clearMessages,
    conversationId,
    setConversationId,
    loadConversation,
    saveToServer,
  } = useChat();
  const { settings, updateSettings } = useSettings();
  const {
    conversations,
    activeId,
    setActiveId,
    searchQuery,
    fetchConversations,
    createConversation,
    deleteConversation,
    renameConversation,
    search,
  } = useConversations();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const prevMessagesLenRef = useRef(0);

  // Detect desktop on mount
  useEffect(() => {
    const isDesktop = window.matchMedia('(min-width: 768px)').matches;
    setSidebarOpen(isDesktop);
  }, []);

  // Save messages to server after assistant response completes
  useEffect(() => {
    if (!isLoading && conversationId && messages.length > 0 && messages.length !== prevMessagesLenRef.current) {
      prevMessagesLenRef.current = messages.length;
      saveToServer(conversationId, messages);
      fetchConversations();
    }
  }, [isLoading, conversationId, messages, saveToServer, fetchConversations]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isLoading) {
        stopGeneration();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === ',') {
        e.preventDefault();
        setSettingsOpen((prev) => !prev);
      }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'N') {
        e.preventDefault();
        handleNewChat();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isLoading, stopGeneration]);

  const handleNewChat = useCallback(() => {
    clearMessages();
    setActiveId(null);
    prevMessagesLenRef.current = 0;
  }, [clearMessages, setActiveId]);

  const handleSelectConversation = useCallback(async (id: string) => {
    setActiveId(id);
    setConversationId(id);
    await loadConversation(id);
    prevMessagesLenRef.current = 0;
  }, [setActiveId, setConversationId, loadConversation]);

  const handleDeleteConversation = useCallback(async (id: string) => {
    await deleteConversation(id);
    if (conversationId === id) {
      clearMessages();
      prevMessagesLenRef.current = 0;
    }
  }, [deleteConversation, conversationId, clearMessages]);

  const handleSend = useCallback(async (content: string, images?: string[]) => {
    let currentConvId = conversationId;

    // If no active conversation, create one first
    if (!currentConvId) {
      const newId = await createConversation();
      if (!newId) return;
      currentConvId = newId;
      setConversationId(newId);
      setActiveId(newId);
    }

    await sendMessage(content, images);

    // Auto-title after first message
    if (messages.length === 0 && currentConvId) {
      setTimeout(async () => {
        try {
          const res = await fetch(`/api/conversations/${currentConvId}/title`, {
            method: 'POST',
          });
          if (res.ok) {
            fetchConversations();
          }
        } catch {
          // title generation failed
        }
      }, 2000);
    }
  }, [conversationId, createConversation, setConversationId, setActiveId, sendMessage, messages.length, fetchConversations]);

  const handleFileDrop = useCallback(async (files: FileList) => {
    for (const file of Array.from(files)) {
      const formData = new FormData();
      formData.append('file', file);

      try {
        const res = await fetch('/api/upload', { method: 'POST', body: formData });
        if (res.ok) {
          const data = await res.json();
          handleSend(`파일 "${data.originalName}"을 업로드했습니다. (경로: ${data.path})`);
        }
      } catch {
        // Upload failed
      }
    }
  }, [handleSend]);

  const handleExport = useCallback(async (id: string, format: 'json' | 'markdown') => {
    try {
      const res = await fetch(`/api/conversations/${id}/export?format=${format}`);
      if (!res.ok) return;

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = format === 'markdown' ? 'conversation.md' : 'conversation.json';
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // export failed
    }
  }, []);

  const handleImport = useCallback(() => {
    fetchConversations();
  }, [fetchConversations]);

  // Touch swipe to open sidebar on mobile
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    if (touch.clientX < 30) {
      touchStartRef.current = { x: touch.clientX, y: touch.clientY };
    }
  }, []);
  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!touchStartRef.current) return;
    const touch = e.changedTouches[0];
    const dx = touch.clientX - touchStartRef.current.x;
    const dy = Math.abs(touch.clientY - touchStartRef.current.y);
    if (dx > 60 && dy < 50) {
      setSidebarOpen(true);
    }
    touchStartRef.current = null;
  }, []);

  return (
    <div className="flex h-screen bg-background" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
      <Sidebar
        conversations={conversations}
        activeId={activeId}
        onSelect={handleSelectConversation}
        onNew={handleNewChat}
        onDelete={handleDeleteConversation}
        onRename={renameConversation}
        onSearch={search}
        searchQuery={searchQuery}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onExport={handleExport}
        onImport={handleImport}
      />

      <main className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="flex items-center justify-between px-4 py-3 border-b border-border bg-background/80 backdrop-blur-sm shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen((prev) => !prev)}
              className="p-1.5 text-muted hover:text-foreground hover:bg-card rounded-lg transition-colors"
              title="사이드바 토글"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>
            <span className="text-xl">🤖</span>
            <h1 className="text-base font-semibold">OllamaAgent</h1>
            <span className="text-[10px] text-muted bg-card px-1.5 py-0.5 rounded">
              {settings?.ollamaModel || 'loading...'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {isLoading && (
              <button
                onClick={stopGeneration}
                className="px-3 py-1.5 text-xs bg-error/20 text-error rounded-lg hover:bg-error/30 transition-colors"
              >
                Stop <span className="text-[10px] opacity-60 ml-1">ESC</span>
              </button>
            )}
            <button
              onClick={handleNewChat}
              className="px-3 py-1.5 text-xs bg-card text-muted rounded-lg hover:text-foreground hover:bg-card-hover transition-colors"
            >
              New Chat
            </button>
            <ThemeToggle />
            <button
              onClick={() => setSettingsOpen(true)}
              className="p-2 text-muted hover:text-foreground hover:bg-card rounded-lg transition-colors"
              title="Settings (Cmd+,)"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
              </svg>
            </button>
          </div>
        </header>

        {/* Messages */}
        <MessageList messages={messages} isLoading={isLoading} onEdit={editMessage} onRegenerate={regenerate} />

        {/* Input */}
        <ChatInput onSend={(msg, imgs) => handleSend(msg, imgs)} disabled={isLoading} onDrop={handleFileDrop} />
      </main>

      {/* Settings */}
      <SettingsPanel
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        onSave={updateSettings}
      />
    </div>
  );
}
