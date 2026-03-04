'use client';

import { useState, useEffect, useCallback } from 'react';
import { useChat } from '@/hooks/useChat';
import { useSettings } from '@/hooks/useSettings';
import MessageList from './MessageList';
import ChatInput from './ChatInput';
import SettingsPanel from '@/components/settings/SettingsPanel';

export default function ChatContainer() {
  const { messages, isLoading, sendMessage, stopGeneration, clearMessages } = useChat();
  const { settings, updateSettings } = useSettings();
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Keyboard shortcut: Escape to stop generation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isLoading) {
        stopGeneration();
      }
      // Cmd/Ctrl + , to toggle settings
      if ((e.metaKey || e.ctrlKey) && e.key === ',') {
        e.preventDefault();
        setSettingsOpen((prev) => !prev);
      }
      // Cmd/Ctrl + Shift + N for new chat
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'N') {
        e.preventDefault();
        clearMessages();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isLoading, stopGeneration, clearMessages]);

  // Save messages to localStorage
  useEffect(() => {
    if (messages.length > 0) {
      localStorage.setItem('chat-history', JSON.stringify(messages));
    }
  }, [messages]);

  const handleFileDrop = useCallback(async (files: FileList) => {
    for (const file of Array.from(files)) {
      const formData = new FormData();
      formData.append('file', file);

      try {
        const res = await fetch('/api/upload', { method: 'POST', body: formData });
        if (res.ok) {
          const data = await res.json();
          sendMessage(`파일 "${data.originalName}"을 업로드했습니다. (경로: ${data.path})`);
        }
      } catch {
        // Upload failed
      }
    }
  }, [sendMessage]);

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-border bg-background/80 backdrop-blur-sm shrink-0">
        <div className="flex items-center gap-3">
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
            onClick={clearMessages}
            className="px-3 py-1.5 text-xs bg-card text-muted rounded-lg hover:text-foreground hover:bg-card-hover transition-colors"
          >
            New Chat
          </button>
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
      <MessageList messages={messages} isLoading={isLoading} />

      {/* Input */}
      <ChatInput onSend={(msg, imgs) => sendMessage(msg, imgs)} disabled={isLoading} onDrop={handleFileDrop} />

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
