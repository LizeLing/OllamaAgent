'use client';

import { useState } from 'react';
import { FolderMeta } from '@/types/folder';

interface FolderGroupProps {
  folder: FolderMeta;
  children: React.ReactNode;
  count: number;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
}

export default function FolderGroup({ folder, children, count, onRename, onDelete }: FolderGroupProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(folder.name);

  const handleRename = () => {
    const trimmed = editName.trim();
    if (trimmed && trimmed !== folder.name) {
      onRename(folder.id, trimmed);
    }
    setIsEditing(false);
  };

  return (
    <div className="mb-1">
      <div className="flex items-center gap-1 px-2 py-1 group">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="p-0.5 text-muted hover:text-foreground transition-colors"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`transition-transform ${isOpen ? 'rotate-90' : ''}`}
          >
            <polyline points="9,18 15,12 9,6" />
          </svg>
        </button>
        <div
          className="w-2.5 h-2.5 rounded-sm shrink-0"
          style={{ backgroundColor: folder.color }}
        />
        {isEditing ? (
          <input
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onBlur={handleRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleRename();
              if (e.key === 'Escape') setIsEditing(false);
            }}
            className="flex-1 text-xs bg-background border border-border rounded px-1 py-0.5 outline-none focus:border-accent"
            autoFocus
          />
        ) : (
          <span className="flex-1 text-xs font-medium text-muted truncate">
            {folder.name}
          </span>
        )}
        <span className="text-[10px] text-muted">{count}</span>
        <div className="hidden group-hover:flex items-center gap-0.5">
          <button
            onClick={(e) => { e.stopPropagation(); setEditName(folder.name); setIsEditing(true); }}
            className="p-0.5 text-muted hover:text-foreground"
            title="이름 변경"
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(folder.id); }}
            className="p-0.5 text-muted hover:text-error"
            title="삭제"
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3,6 5,6 21,6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
          </button>
        </div>
      </div>
      {isOpen && <div className="ml-2">{children}</div>}
    </div>
  );
}
