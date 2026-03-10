'use client';

import ThemeToggle from '@/components/ui/ThemeToggle';

interface ChatHeaderProps {
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  selectedModel: string | null;
  ollamaModel: string;
  availableModels: string[];
  onModelChange: (model: string | null) => void;
  isLoading: boolean;
  onStop: () => void;
  onNewChat: () => void;
  onOpenToolLog: () => void;
  onOpenStats: () => void;
  onOpenShortcuts: () => void;
}

export default function ChatHeader({
  onToggleSidebar,
  selectedModel,
  ollamaModel,
  availableModels,
  onModelChange,
  isLoading,
  onStop,
  onNewChat,
  onOpenToolLog,
  onOpenStats,
  onOpenShortcuts,
}: ChatHeaderProps) {
  return (
    <header className="flex items-center justify-between px-4 py-3 border-b border-border bg-background/80 backdrop-blur-sm shrink-0">
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleSidebar}
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
          value={selectedModel || ollamaModel || ''}
          onChange={(e) => onModelChange(e.target.value || null)}
          className="text-[10px] text-muted bg-card px-1.5 py-0.5 rounded border-none outline-none cursor-pointer"
          title="모델 선택"
        >
          {availableModels.length > 0 ? (
            availableModels.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))
          ) : (
            <option value={ollamaModel || ''}>{ollamaModel || 'loading...'}</option>
          )}
        </select>
      </div>
      <div className="flex items-center gap-2">
        {isLoading && (
          <button
            onClick={onStop}
            className="px-3 py-1.5 text-xs bg-error/20 text-error rounded-lg hover:bg-error/30 transition-colors"
          >
            Stop <span className="text-[10px] opacity-60 ml-1">ESC</span>
          </button>
        )}
        <button
          onClick={onNewChat}
          className="px-3 py-1.5 text-xs bg-card text-muted rounded-lg hover:text-foreground hover:bg-card-hover transition-colors"
        >
          New Chat
        </button>
        <ThemeToggle />
        <button
          onClick={onOpenToolLog}
          className="p-2 text-muted hover:text-foreground hover:bg-card rounded-lg transition-colors"
          title="도구 로그"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
          </svg>
        </button>
        <button
          onClick={onOpenStats}
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
          onClick={onOpenShortcuts}
          className="p-2 text-muted hover:text-foreground hover:bg-card rounded-lg transition-colors"
          title="단축키 (?)"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        </button>
      </div>
    </header>
  );
}
