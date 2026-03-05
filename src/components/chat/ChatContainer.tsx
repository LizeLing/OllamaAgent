'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useChat } from '@/hooks/useChat';
import { useSettings } from '@/hooks/useSettings';
import { useConversations } from '@/hooks/useConversations';
import { addToast } from '@/hooks/useToast';
import MessageList from './MessageList';
import ChatInput from './ChatInput';
import SettingsPanel from '@/components/settings/SettingsPanel';
import ThemeToggle from '@/components/ui/ThemeToggle';
import Sidebar from '@/components/sidebar/Sidebar';
import ToolApprovalModal from '@/components/chat/ToolApprovalModal';
import ShortcutGuide from '@/components/ui/ShortcutGuide';
import StatsPanel from '@/components/ui/StatsPanel';
import ToolLogPanel from '@/components/ui/ToolLogPanel';
import { COMMANDS } from '@/lib/commands/definitions';

export default function ChatContainer() {
  const {
    messages,
    isLoading,
    sendMessage,
    editMessage,
    regenerate,
    stopGeneration,
    clearMessages,
    addSystemMessage,
    conversationId,
    setConversationId,
    loadConversation,
    saveToServer,
    pendingApproval,
    respondToApproval,
  } = useChat();
  const { settings, updateSettings } = useSettings();
  const {
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
    deleteFolder: deleteFolderFn,
    renameFolder,
  } = useConversations();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Set initial sidebar state based on screen size after hydration
  useEffect(() => {
    setSidebarOpen(window.matchMedia('(min-width: 768px)').matches);
  }, []);
  const [shortcutGuideOpen, setShortcutGuideOpen] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);
  const [toolLogOpen, setToolLogOpen] = useState(false);
  const [isDragOverPage, setIsDragOverPage] = useState(false);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const prevMessagesLenRef = useRef(0);
  const dragCounterRef = useRef(0);

  // Save messages to server after assistant response completes
  useEffect(() => {
    if (!isLoading && conversationId && messages.length > 0 && messages.length !== prevMessagesLenRef.current) {
      prevMessagesLenRef.current = messages.length;
      saveToServer(conversationId, messages);
      fetchConversations();
    }
  }, [isLoading, conversationId, messages, saveToServer, fetchConversations]);

  useEffect(() => {
    fetch('/api/models')
      .then((r) => r.json())
      .then((data) => setAvailableModels(data.models || []))
      .catch(() => {});
  }, []);

  const handleNewChat = useCallback(() => {
    clearMessages();
    setActiveId(null);
    prevMessagesLenRef.current = 0;
  }, [clearMessages, setActiveId]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isLoading) {
        stopGeneration();
      }
      if (e.key === 'Escape' && shortcutGuideOpen) {
        setShortcutGuideOpen(false);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === ',') {
        e.preventDefault();
        setSettingsOpen((prev) => !prev);
      }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'N') {
        e.preventDefault();
        handleNewChat();
      }
      if (e.key === '?' && !['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement).tagName)) {
        e.preventDefault();
        setShortcutGuideOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isLoading, stopGeneration, handleNewChat, shortcutGuideOpen]);

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

    if (!currentConvId) {
      const newId = await createConversation();
      if (!newId) return;
      currentConvId = newId;
      setConversationId(newId);
      setActiveId(newId);
    }

    await sendMessage(content, images, selectedModel || undefined);

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
  }, [conversationId, createConversation, setConversationId, setActiveId, sendMessage, messages.length, fetchConversations, selectedModel]);

  // Branch conversation from a specific message
  const handleBranch = useCallback(async (messageId: string) => {
    const msgIndex = messages.findIndex((m) => m.id === messageId);
    if (msgIndex === -1) return;

    const branchedMessages = messages.slice(0, msgIndex + 1);
    const newId = await createConversation('분기된 대화');
    if (!newId) return;

    try {
      await fetch(`/api/conversations/${newId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: branchedMessages,
          branchedFrom: conversationId ? { conversationId, messageIndex: msgIndex } : undefined,
        }),
      });
      setConversationId(newId);
      setActiveId(newId);
      await loadConversation(newId);
      prevMessagesLenRef.current = 0;
      fetchConversations();
      addToast('info', '대화가 분기되었습니다.');
    } catch {
      addToast('error', '대화 분기에 실패했습니다.');
    }
  }, [messages, conversationId, createConversation, setConversationId, setActiveId, loadConversation, fetchConversations]);

  const handleFileDrop = useCallback(async (files: FileList) => {
    for (const file of Array.from(files).slice(0, 5)) {
      const formData = new FormData();
      formData.append('file', file);

      try {
        const res = await fetch('/api/upload', { method: 'POST', body: formData });
        if (res.status === 429) {
          addToast('warning', '업로드 요청이 너무 많습니다.');
          return;
        }
        if (res.ok) {
          const data = await res.json();
          if (data.content) {
            handleSend(`파일 "${data.originalName}"의 내용입니다:\n\n\`\`\`\n${data.content}\n\`\`\``);
          } else {
            handleSend(`파일 "${data.originalName}"을 업로드했습니다. (경로: ${data.path})`);
          }
        } else {
          const err = await res.json().catch(() => ({ error: 'Upload failed' }));
          addToast('error', err.error || '업로드 실패');
        }
      } catch {
        addToast('error', '파일 업로드에 실패했습니다.');
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
      addToast('error', '내보내기에 실패했습니다.');
    }
  }, []);

  const handleCommand = useCallback((name: string, args: string[]) => {
    switch (name) {
      case 'new':
        handleNewChat();
        break;
      case 'clear':
        clearMessages();
        addSystemMessage('대화가 초기화되었습니다.');
        break;
      case 'model':
        if (args[0]) {
          setSelectedModel(args[0]);
          addSystemMessage(`모델이 ${args[0]}으로 변경되었습니다.`);
        } else {
          addSystemMessage(`현재 모델: ${selectedModel || settings?.ollamaModel || '없음'}\n사용 가능: ${availableModels.join(', ')}`);
        }
        break;
      case 'help': {
        const helpText = COMMANDS.map(
          (c) => `**/${c.name}** — ${c.description}`
        ).join('\n');
        addSystemMessage(`## 명령어 목록\n\n${helpText}`);
        break;
      }
      case 'stats': {
        const totalTokens = messages.reduce(
          (sum, m) => sum + (m.tokenUsage?.totalTokens || 0), 0
        );
        addSystemMessage(
          `## 세션 통계\n\n` +
          `- 메시지 수: ${messages.length}\n` +
          `- 총 토큰: ${totalTokens}\n` +
          `- 모델: ${selectedModel || settings?.ollamaModel || '없음'}\n` +
          `- 대화 ID: ${conversationId || '없음'}`
        );
        break;
      }
      case 'export':
        if (activeId) {
          handleExport(activeId, (args[0] as 'json' | 'markdown') || 'json');
        } else {
          addSystemMessage('내보낼 대화가 없습니다.');
        }
        break;
      case 'system':
        if (args[0]) {
          fetch('/api/settings', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ systemPrompt: args[0] }),
          }).then(() => {
            addSystemMessage(`시스템 프롬프트가 변경되었습니다.`);
          }).catch(() => {
            addSystemMessage('시스템 프롬프트 변경에 실패했습니다.');
          });
        }
        break;
    }
  }, [handleNewChat, clearMessages, addSystemMessage, selectedModel, settings, availableModels, messages, conversationId, activeId, handleExport]);

  const handleImport = useCallback(() => {
    fetchConversations();
  }, [fetchConversations]);

  // Page-level drag overlay
  const handlePageDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current++;
    if (e.dataTransfer.types.includes('Files')) {
      setIsDragOverPage(true);
    }
  }, []);

  const handlePageDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) {
      setIsDragOverPage(false);
    }
  }, []);

  const handlePageDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current = 0;
    setIsDragOverPage(false);
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFileDrop(files);
    }
  }, [handleFileDrop]);

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
    <div
      className="flex h-screen bg-background"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onDragEnter={handlePageDragEnter}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={handlePageDragLeave}
      onDrop={handlePageDrop}
    >
      <Sidebar
        conversations={conversations}
        folders={folders}
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
        onTogglePin={togglePin}
        onMoveToFolder={moveToFolder}
        onCreateFolder={createFolder}
        onDeleteFolder={deleteFolderFn}
        onRenameFolder={renameFolder}
        onUpdateTags={updateTags}
      />

      <main className="flex-1 flex flex-col min-w-0 relative">
        {/* Drag overlay */}
        {isDragOverPage && (
          <div className="absolute inset-0 z-20 bg-accent/10 border-2 border-dashed border-accent rounded-lg flex items-center justify-center pointer-events-none">
            <div className="text-center">
              <div className="text-3xl mb-2">📁</div>
              <p className="text-sm font-medium text-accent">파일을 놓아주세요</p>
              <p className="text-xs text-muted mt-1">최대 5개 파일</p>
            </div>
          </div>
        )}

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
            <select
              value={selectedModel || settings?.ollamaModel || ''}
              onChange={(e) => setSelectedModel(e.target.value || null)}
              className="text-[10px] text-muted bg-card px-1.5 py-0.5 rounded border-none outline-none cursor-pointer"
              title="모델 선택"
            >
              {availableModels.length > 0 ? (
                availableModels.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))
              ) : (
                <option value={settings?.ollamaModel || ''}>{settings?.ollamaModel || 'loading...'}</option>
              )}
            </select>
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
              onClick={() => setToolLogOpen(true)}
              className="p-2 text-muted hover:text-foreground hover:bg-card rounded-lg transition-colors"
              title="도구 로그"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
              </svg>
            </button>
            <button
              onClick={() => setStatsOpen(true)}
              className="p-2 text-muted hover:text-foreground hover:bg-card rounded-lg transition-colors"
              title="통계"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="20" x2="18" y2="10" />
                <line x1="12" y1="20" x2="12" y2="4" />
                <line x1="6" y1="20" x2="6" y2="14" />
              </svg>
            </button>
            <button
              onClick={() => setShortcutGuideOpen(true)}
              className="p-2 text-muted hover:text-foreground hover:bg-card rounded-lg transition-colors"
              title="단축키 (?)"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
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
        <MessageList
          messages={messages}
          isLoading={isLoading}
          onEdit={editMessage}
          onRegenerate={regenerate}
          onSend={(msg) => handleSend(msg)}
          onBranch={handleBranch}
        />

        {/* Input */}
        <ChatInput onSend={(msg, imgs) => handleSend(msg, imgs)} onCommand={handleCommand} disabled={isLoading} onDrop={handleFileDrop} />
      </main>

      {/* Settings */}
      <SettingsPanel
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        onSave={updateSettings}
      />

      {/* Tool Approval Modal */}
      {pendingApproval && (
        <ToolApprovalModal
          toolName={pendingApproval.toolName}
          toolInput={pendingApproval.toolInput}
          confirmId={pendingApproval.confirmId}
          onRespond={respondToApproval}
        />
      )}

      {/* Shortcut Guide */}
      <ShortcutGuide isOpen={shortcutGuideOpen} onClose={() => setShortcutGuideOpen(false)} />

      <StatsPanel isOpen={statsOpen} onClose={() => setStatsOpen(false)} />
      <ToolLogPanel isOpen={toolLogOpen} onClose={() => setToolLogOpen(false)} messages={messages} />
    </div>
  );
}
