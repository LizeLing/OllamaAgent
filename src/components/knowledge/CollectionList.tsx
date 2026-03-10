'use client';

import { useState } from 'react';
import type { Collection } from '@/types/knowledge';

interface CollectionListProps {
  collections: Collection[];
  onSelect: (id: string) => void;
  onCreate: (name: string) => void;
  onDelete: (id: string) => void;
}

export default function CollectionList({ collections, onSelect, onCreate, onDelete }: CollectionListProps) {
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState('');

  const handleCreate = () => {
    const trimmed = newName.trim();
    if (trimmed) {
      onCreate(trimmed);
      setNewName('');
      setShowNew(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-foreground">컬렉션</h3>
        <button
          onClick={() => setShowNew(true)}
          className="px-2 py-1 text-xs bg-accent/20 text-accent rounded-lg hover:bg-accent/30 transition-colors"
        >
          + 새 컬렉션
        </button>
      </div>

      {showNew && (
        <div className="flex gap-2 mb-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreate();
              if (e.key === 'Escape') setShowNew(false);
            }}
            placeholder="컬렉션 이름..."
            className="flex-1 text-sm bg-card text-foreground placeholder:text-muted rounded-lg px-2 py-1 outline-none focus:ring-1 focus:ring-accent border border-border"
            autoFocus
          />
          <button onClick={handleCreate} className="text-xs text-accent hover:text-accent-hover">생성</button>
          <button onClick={() => setShowNew(false)} className="text-xs text-muted hover:text-foreground">취소</button>
        </div>
      )}

      {collections.length === 0 ? (
        <p className="text-xs text-muted py-4 text-center">컬렉션이 없습니다</p>
      ) : (
        <div className="space-y-1">
          {collections.map((coll) => (
            <div
              key={coll.id}
              className="flex items-center justify-between px-3 py-2 rounded-lg bg-card hover:bg-card-hover cursor-pointer transition-colors group"
              onClick={() => onSelect(coll.id)}
            >
              <div className="flex items-center gap-2">
                <span className="text-sm text-foreground">{coll.name}</span>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(coll.id); }}
                className="text-xs text-muted hover:text-error opacity-0 group-hover:opacity-100 transition-opacity"
                title="삭제"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
