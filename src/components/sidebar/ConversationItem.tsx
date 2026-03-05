'use client';

import { useState, useRef, useEffect } from 'react';
import { ConversationMeta } from '@/types/conversation';
import { FolderMeta } from '@/types/folder';

function formatTimeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return '방금 전';
  if (minutes < 60) return `${minutes}분 전`;
  if (hours < 24) return `${hours}시간 전`;
  if (days < 30) return `${days}일 전`;

  const date = new Date(timestamp);
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;
}

interface ConversationItemProps {
  conversation: ConversationMeta;
  isActive: boolean;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onTogglePin?: (id: string) => void;
  onMoveToFolder?: (convId: string, folderId: string | null) => void;
  onUpdateTags?: (id: string, tags: string[]) => void;
  folders?: FolderMeta[];
}

export default function ConversationItem({
  conversation,
  isActive,
  onSelect,
  onDelete,
  onRename,
  onTogglePin,
  onMoveToFolder,
  onUpdateTags,
  folders,
}: ConversationItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(conversation.title);
  const [showFolderMenu, setShowFolderMenu] = useState(false);
  const [showTagEditor, setShowTagEditor] = useState(false);
  const [tagInput, setTagInput] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  useEffect(() => {
    if (!showFolderMenu) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowFolderMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showFolderMenu]);

  const handleRename = () => {
    const trimmed = editTitle.trim();
    if (trimmed && trimmed !== conversation.title) {
      onRename(conversation.id, trimmed);
    }
    setIsEditing(false);
  };

  return (
    <div
      className={`group rounded-lg cursor-pointer transition-colors ${
        isActive ? 'bg-accent/20 text-foreground' : 'text-muted hover:bg-card hover:text-foreground'
      }`}
      onClick={() => !isEditing && onSelect(conversation.id)}
    >
      <div className="flex items-center gap-2 px-3 py-2">
      {/* Pin indicator */}
      {conversation.pinned && (
        <span className="text-accent text-[10px] shrink-0" title="고정됨">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1">
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
          </svg>
        </span>
      )}

      <div className="flex-1 min-w-0">
        {isEditing ? (
          <input
            ref={inputRef}
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            onBlur={handleRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleRename();
              if (e.key === 'Escape') setIsEditing(false);
            }}
            className="w-full text-sm bg-background border border-border rounded px-1 py-0.5 outline-none focus:border-accent"
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <>
            <div className="text-sm truncate">{conversation.title}</div>
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-muted">{formatTimeAgo(conversation.updatedAt)}</span>
              {conversation.tags && conversation.tags.length > 0 && (
                <div className="flex gap-0.5">
                  {conversation.tags.slice(0, 2).map((tag) => (
                    <span key={tag} className="text-[9px] bg-accent/10 text-accent px-1 rounded">
                      {tag}
                    </span>
                  ))}
                  {conversation.tags.length > 2 && (
                    <span className="text-[9px] text-muted">+{conversation.tags.length - 2}</span>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {!isEditing && (
        <div className="hidden group-hover:flex items-center gap-0.5 shrink-0 relative">
          {onTogglePin && (
            <button
              onClick={(e) => { e.stopPropagation(); onTogglePin(conversation.id); }}
              className={`p-1 rounded transition-colors ${conversation.pinned ? 'text-accent' : 'text-muted hover:text-foreground'}`}
              title={conversation.pinned ? '고정 해제' : '고정'}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill={conversation.pinned ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
              </svg>
            </button>
          )}
          {onMoveToFolder && folders && folders.length > 0 && (
            <div ref={menuRef}>
              <button
                onClick={(e) => { e.stopPropagation(); setShowFolderMenu(!showFolderMenu); }}
                className="p-1 text-muted hover:text-foreground rounded transition-colors"
                title="폴더 이동"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>
              </button>
              {showFolderMenu && (
                <div className="absolute right-0 top-full mt-1 bg-card border border-border rounded-lg shadow-lg z-50 py-1 min-w-[120px]">
                  <button
                    onClick={(e) => { e.stopPropagation(); onMoveToFolder(conversation.id, null); setShowFolderMenu(false); }}
                    className="w-full px-3 py-1 text-xs text-left text-muted hover:bg-card-hover hover:text-foreground"
                  >
                    미분류
                  </button>
                  {folders.map((f) => (
                    <button
                      key={f.id}
                      onClick={(e) => { e.stopPropagation(); onMoveToFolder(conversation.id, f.id); setShowFolderMenu(false); }}
                      className="w-full px-3 py-1 text-xs text-left text-muted hover:bg-card-hover hover:text-foreground flex items-center gap-1.5"
                    >
                      <div className="w-2 h-2 rounded-sm" style={{ backgroundColor: f.color }} />
                      {f.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {onUpdateTags && (
            <button
              onClick={(e) => { e.stopPropagation(); setShowTagEditor(!showTagEditor); }}
              className="p-1 text-muted hover:text-foreground rounded transition-colors"
              title="태그 편집"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/>
                <line x1="7" y1="7" x2="7.01" y2="7"/>
              </svg>
            </button>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              setEditTitle(conversation.title);
              setIsEditing(true);
            }}
            className="p-1 text-muted hover:text-foreground rounded transition-colors"
            title="이름 변경"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (confirmDelete) {
                onDelete(conversation.id);
                setConfirmDelete(false);
              } else {
                setConfirmDelete(true);
                setTimeout(() => setConfirmDelete(false), 3000);
              }
            }}
            className={`p-1 rounded transition-colors ${confirmDelete ? 'text-error bg-error/10' : 'text-muted hover:text-error'}`}
            title={confirmDelete ? '삭제 확인' : '삭제'}
          >
            {confirmDelete ? (
              <span className="text-[10px] font-medium px-0.5">삭제?</span>
            ) : (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3,6 5,6 21,6" />
                <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
              </svg>
            )}
          </button>
        </div>
      )}
      </div>

      {showTagEditor && onUpdateTags && (
        <div
          className="mt-1 px-2 pb-1"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex flex-wrap gap-1 mb-1">
            {(conversation.tags || []).map((tag) => (
              <span key={tag} className="inline-flex items-center gap-0.5 text-[10px] bg-accent/10 text-accent px-1.5 py-0.5 rounded">
                {tag}
                <button
                  onClick={() => {
                    const newTags = (conversation.tags || []).filter((t) => t !== tag);
                    onUpdateTags(conversation.id, newTags);
                  }}
                  className="hover:text-error"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
          <div className="flex gap-1">
            <input
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && tagInput.trim()) {
                  const newTags = [...(conversation.tags || []), tagInput.trim()];
                  onUpdateTags(conversation.id, [...new Set(newTags)]);
                  setTagInput('');
                }
                if (e.key === 'Escape') setShowTagEditor(false);
              }}
              placeholder="태그 추가..."
              className="flex-1 text-[10px] bg-background border border-border rounded px-1.5 py-0.5 outline-none focus:border-accent"
              autoFocus
            />
          </div>
        </div>
      )}
    </div>
  );
}
