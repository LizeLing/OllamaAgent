'use client';

import { useState, useRef } from 'react';
import { ConversationMeta } from '@/types/conversation';
import { FolderMeta } from '@/types/folder';
import ConversationItem from './ConversationItem';
import FolderGroup from './FolderGroup';

interface SidebarProps {
  conversations: ConversationMeta[];
  folders: FolderMeta[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onSearch: (query: string) => void;
  searchQuery: string;
  isOpen: boolean;
  onClose: () => void;
  onExport: (id: string, format: 'json' | 'markdown') => void;
  onImport: () => void;
  onTogglePin: (id: string) => void;
  onMoveToFolder: (convId: string, folderId: string | null) => void;
  onCreateFolder: (name: string, color?: string) => void;
  onDeleteFolder: (id: string) => void;
  onRenameFolder: (id: string, name: string) => void;
}

export default function Sidebar({
  conversations,
  folders,
  activeId,
  onSelect,
  onNew,
  onDelete,
  onRename,
  onSearch,
  searchQuery,
  isOpen,
  onClose,
  onExport,
  onImport,
  onTogglePin,
  onMoveToFolder,
  onCreateFolder,
  onDeleteFolder,
  onRenameFolder,
}: SidebarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const res = await fetch('/api/conversations/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        onImport();
      }
    } catch {
      // import failed
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleExport = (id: string) => {
    onExport(id, 'json');
  };

  const handleCreateFolder = () => {
    const trimmed = newFolderName.trim();
    if (trimmed) {
      onCreateFolder(trimmed);
      setNewFolderName('');
      setShowNewFolder(false);
    }
  };

  // Group conversations
  const pinned = conversations.filter((c) => c.pinned);
  const byFolder = new Map<string, ConversationMeta[]>();
  const uncategorized: ConversationMeta[] = [];

  for (const conv of conversations) {
    if (conv.pinned) continue; // pinned shown separately
    if (conv.folderId) {
      const list = byFolder.get(conv.folderId) || [];
      list.push(conv);
      byFolder.set(conv.folderId, list);
    } else {
      uncategorized.push(conv);
    }
  }

  const renderItem = (conv: ConversationMeta) => (
    <ConversationItem
      key={conv.id}
      conversation={conv}
      isActive={conv.id === activeId}
      onSelect={(id) => { onSelect(id); onClose(); }}
      onDelete={onDelete}
      onRename={onRename}
      onTogglePin={onTogglePin}
      onMoveToFolder={onMoveToFolder}
      folders={folders}
    />
  );

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 md:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        } fixed md:relative z-30 md:z-auto md:translate-x-0 w-72 h-screen flex flex-col bg-background border-r border-border transition-transform duration-200`}
      >
        {/* New conversation button */}
        <div className="p-3 border-b border-border flex gap-2">
          <button
            onClick={onNew}
            className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm bg-accent/20 text-accent rounded-lg hover:bg-accent/30 transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            새 대화
          </button>
          <button
            onClick={() => setShowNewFolder(true)}
            className="p-2 text-muted hover:text-foreground hover:bg-card rounded-lg transition-colors"
            title="새 폴더"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>
          </button>
        </div>

        {/* New folder input */}
        {showNewFolder && (
          <div className="px-3 py-2 border-b border-border flex gap-2">
            <input
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreateFolder();
                if (e.key === 'Escape') setShowNewFolder(false);
              }}
              placeholder="폴더 이름..."
              className="flex-1 text-sm bg-card text-foreground placeholder:text-muted rounded-lg px-2 py-1 outline-none focus:ring-1 focus:ring-accent border border-border"
              autoFocus
            />
            <button onClick={handleCreateFolder} className="text-xs text-accent hover:text-accent-hover">생성</button>
            <button onClick={() => setShowNewFolder(false)} className="text-xs text-muted hover:text-foreground">취소</button>
          </div>
        )}

        {/* Search */}
        <div className="px-3 py-2">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="대화 검색..."
            className="w-full text-sm bg-card text-foreground placeholder:text-muted rounded-lg px-3 py-1.5 outline-none focus:ring-1 focus:ring-accent border border-border"
          />
        </div>

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto px-2 py-1">
          {conversations.length === 0 ? (
            <div className="text-center text-muted text-xs py-8">
              {searchQuery ? '검색 결과가 없습니다' : '대화가 없습니다'}
            </div>
          ) : (
            <>
              {/* Pinned section */}
              {pinned.length > 0 && (
                <div className="mb-2">
                  <div className="px-2 py-1 text-[10px] font-medium text-muted uppercase tracking-wider">고정됨</div>
                  <div className="space-y-0.5">{pinned.map(renderItem)}</div>
                </div>
              )}

              {/* Folder groups */}
              {folders.map((folder) => {
                const items = byFolder.get(folder.id) || [];
                if (items.length === 0 && searchQuery) return null;
                return (
                  <FolderGroup
                    key={folder.id}
                    folder={folder}
                    count={items.length}
                    onRename={onRenameFolder}
                    onDelete={onDeleteFolder}
                  >
                    <div className="space-y-0.5">{items.map(renderItem)}</div>
                  </FolderGroup>
                );
              })}

              {/* Uncategorized */}
              {uncategorized.length > 0 && (
                <div className="mb-2">
                  {(folders.length > 0 || pinned.length > 0) && (
                    <div className="px-2 py-1 text-[10px] font-medium text-muted uppercase tracking-wider">미분류</div>
                  )}
                  <div className="space-y-0.5">{uncategorized.map(renderItem)}</div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Bottom actions */}
        <div className="p-3 border-t border-border flex gap-2">
          <button
            onClick={handleImportClick}
            className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-xs text-muted bg-card rounded-lg hover:text-foreground hover:bg-card-hover transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
              <polyline points="17,8 12,3 7,8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            가져오기
          </button>
          {activeId && (
            <button
              onClick={() => handleExport(activeId)}
              className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-xs text-muted bg-card rounded-lg hover:text-foreground hover:bg-card-hover transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                <polyline points="7,10 12,15 17,10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              내보내기
            </button>
          )}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          className="hidden"
          onChange={handleFileChange}
        />
      </aside>
    </>
  );
}
