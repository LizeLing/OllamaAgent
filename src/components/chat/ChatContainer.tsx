'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useChat } from '@/hooks/useChat';
import { useSettings } from '@/hooks/useSettings';
import { useConversations } from '@/hooks/useConversations';
import { addToast } from '@/hooks/useToast';
import MessageList from './MessageList';
import ChatInput from './ChatInput';
import ChatHeader from './ChatHeader';
import SettingsPanel from '@/components/settings/SettingsPanel';
import SkillEditor from '@/components/settings/SkillEditor';
import CronJobEditor from '@/components/settings/CronJobEditor';
import HelpTooltip from '@/components/ui/HelpTooltip';
import Sidebar from '@/components/sidebar/Sidebar';
import ToolApprovalModal from '@/components/chat/ToolApprovalModal';
import ShortcutGuide from '@/components/ui/ShortcutGuide';
import StatsPanel from '@/components/ui/StatsPanel';
import ToolLogPanel from '@/components/ui/ToolLogPanel';
import ArtifactPanel from '@/components/artifacts/ArtifactPanel';
import { Artifact } from '@/types/artifacts';
import { useCommands } from './useCommands';
import { useDragDrop } from './useDragDrop';

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
  const [activeView, setActiveView] = useState<'chat' | 'settings' | 'skills' | 'cron'>('chat');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // 화면 크기에 따른 사이드바 상태 + 리사이즈 감지
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    setSidebarOpen(mq.matches);
    const handler = (e: MediaQueryListEvent) => setSidebarOpen(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  const [shortcutGuideOpen, setShortcutGuideOpen] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);
  const [toolLogOpen, setToolLogOpen] = useState(false);
  const [showArtifacts, setShowArtifacts] = useState(false);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const prevMessagesLenRef = useRef(0);
  const titleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 타이머 cleanup
  useEffect(() => {
    return () => {
      if (titleTimerRef.current) clearTimeout(titleTimerRef.current);
    };
  }, []);

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

  // 대화별 아티팩트 조회
  useEffect(() => {
    if (!conversationId) {
      setArtifacts([]);
      setShowArtifacts(false);
      return;
    }
    fetch(`/api/artifacts?conversationId=${conversationId}`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setArtifacts(data);
      })
      .catch(() => setArtifacts([]));
  }, [conversationId]);

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
        setActiveView((prev) => prev === 'settings' ? 'chat' : 'settings');
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
      const timerId = setTimeout(async () => {
        try {
          const res = await fetch(`/api/conversations/${currentConvId}/title`, {
            method: 'POST',
          });
          if (res.ok) {
            fetchConversations();
          }
        } catch {
          // Title auto-generation failed, non-critical
        }
      }, 2000);
      titleTimerRef.current = timerId;
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
    } catch (err) {
      console.error('[handleBranch]', err);
      addToast('error', '대화 분기에 실패했습니다.');
    }
  }, [messages, conversationId, createConversation, setConversationId, setActiveId, loadConversation, fetchConversations]);

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
    } catch (err) {
      console.error('[handleExport]', err);
      addToast('error', '내보내기에 실패했습니다.');
    }
  }, []);

  const { handleCommand } = useCommands({
    handleNewChat,
    clearMessages,
    addSystemMessage,
    selectedModel,
    ollamaModel: settings?.ollamaModel || '',
    availableModels,
    messages,
    conversationId,
    activeId,
    handleExport,
    handleSend,
    setSelectedModel,
  });

  const handleImport = useCallback(() => {
    fetchConversations();
  }, [fetchConversations]);

  const {
    isDragOverPage,
    handleFileDrop,
    handlePageDragEnter,
    handlePageDragLeave,
    handlePageDrop,
  } = useDragDrop(handleSend);

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
        onSelect={(id) => { setActiveView('chat'); handleSelectConversation(id); }}
        onNew={() => { setActiveView('chat'); handleNewChat(); }}
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
        activeView={activeView}
        onViewChange={(view) => setActiveView(view as 'chat' | 'settings' | 'skills' | 'cron')}
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
        <ChatHeader
          sidebarOpen={sidebarOpen}
          onToggleSidebar={() => setSidebarOpen((prev) => !prev)}
          selectedModel={selectedModel}
          ollamaModel={settings?.ollamaModel || ''}
          availableModels={availableModels}
          onModelChange={setSelectedModel}
          isLoading={isLoading}
          onStop={stopGeneration}
          onNewChat={handleNewChat}
          onOpenToolLog={() => setToolLogOpen(true)}
          onOpenStats={() => setStatsOpen(true)}
          onOpenShortcuts={() => setShortcutGuideOpen(true)}
        />

        {activeView === 'settings' ? (
          <SettingsPanel
            onClose={() => setActiveView('chat')}
            settings={settings}
            onSave={updateSettings}
          />
        ) : activeView === 'skills' ? (
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-2xl mx-auto px-6 py-6 md:py-8">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-semibold">스킬 관리</h2>
                  <HelpTooltip text={"다단계 워크플로우를 정의하여 에이전트가 복잡한 작업을 체계적으로 수행하도록 합니다.\n\n/skill 명령어로 실행합니다."} />
                </div>
                <button
                  onClick={() => setActiveView('chat')}
                  className="px-3 py-1.5 text-sm text-muted hover:text-foreground bg-card hover:bg-card-hover rounded-lg transition-colors"
                >
                  돌아가기
                </button>
              </div>
              <SkillEditor />
            </div>
          </div>
        ) : activeView === 'cron' ? (
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-2xl mx-auto px-6 py-6 md:py-8">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-semibold">예약 작업</h2>
                  <HelpTooltip text={"주기적으로 자동 실행되는 예약 작업을 관리합니다.\n\n작업 유형: 에이전트 실행, HTTP 요청, 메모리 정리, 건강 체크"} />
                </div>
                <button
                  onClick={() => setActiveView('chat')}
                  className="px-3 py-1.5 text-sm text-muted hover:text-foreground bg-card hover:bg-card-hover rounded-lg transition-colors"
                >
                  돌아가기
                </button>
              </div>
              <CronJobEditor />
            </div>
          </div>
        ) : (
          <div className="flex flex-1 overflow-hidden">
            {/* 채팅 영역 */}
            <div className="flex-1 flex flex-col min-w-0">
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
              <div className="relative">
                {/* 아티팩트 토글 버튼 */}
                {artifacts.length > 0 && (
                  <button
                    onClick={() => setShowArtifacts((prev) => !prev)}
                    className={`absolute -top-10 right-4 px-2.5 py-1 text-xs rounded-lg transition-colors flex items-center gap-1.5 ${
                      showArtifacts
                        ? 'bg-accent/20 text-accent'
                        : 'bg-card text-muted-foreground hover:text-foreground hover:bg-card-hover'
                    }`}
                    title="아티팩트 패널 토글"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                    </svg>
                    아티팩트 ({artifacts.length})
                  </button>
                )}
                <ChatInput onSend={(msg, imgs) => handleSend(msg, imgs)} onCommand={handleCommand} disabled={isLoading} onDrop={handleFileDrop} />
              </div>
            </div>

            {/* 아티팩트 패널 */}
            {showArtifacts && conversationId && (
              <div className="w-[400px] shrink-0">
                <ArtifactPanel
                  conversationId={conversationId}
                  artifacts={artifacts}
                  onClose={() => setShowArtifacts(false)}
                />
              </div>
            )}
          </div>
        )}
      </main>

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
