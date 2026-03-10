'use client';

import { useState } from 'react';
import { Artifact } from '@/types/artifacts';
import ArtifactItem from './ArtifactItem';

interface ArtifactPanelProps {
  conversationId: string;
  artifacts: Artifact[];
  onClose: () => void;
}

export default function ArtifactPanel({ artifacts, onClose }: ArtifactPanelProps) {
  const [selected, setSelected] = useState<Artifact | null>(artifacts[0] || null);

  return (
    <div className="flex flex-col h-full border-l border-border bg-background">
      {/* 상단 헤더 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <h3 className="text-sm font-semibold text-foreground">
          아티팩트 ({artifacts.length})
        </h3>
        <button
          onClick={onClose}
          className="p-1.5 text-muted hover:text-foreground hover:bg-card rounded-lg transition-colors"
          title="아티팩트 패널 닫기"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {artifacts.length === 0 ? (
        /* 빈 목록 안내 */
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="text-center text-muted">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mx-auto mb-3 opacity-40">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
            <p className="text-sm">아티팩트가 없습니다</p>
            <p className="text-xs mt-1 text-muted-foreground">
              코드, 이미지, 파일 등이 여기에 표시됩니다
            </p>
          </div>
        </div>
      ) : (
        /* 목록 + 상세 분할 */
        <div className="flex flex-1 overflow-hidden">
          {/* 왼쪽: 아티팩트 목록 */}
          <div className="w-48 border-r border-border overflow-y-auto shrink-0">
            {artifacts.map((a) => (
              <button
                key={a.id}
                onClick={() => setSelected(a)}
                className={`w-full text-left px-3 py-2.5 text-sm hover:bg-muted transition-colors border-b border-border/50 ${
                  selected?.id === a.id ? 'bg-muted text-foreground' : 'text-muted-foreground'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="shrink-0">
                    {a.type === 'code' && (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="16 18 22 12 16 6" />
                        <polyline points="8 6 2 12 8 18" />
                      </svg>
                    )}
                    {a.type === 'image' && (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                        <circle cx="8.5" cy="8.5" r="1.5" />
                        <polyline points="21 15 16 10 5 21" />
                      </svg>
                    )}
                    {a.type === 'file' && (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                      </svg>
                    )}
                  </span>
                  <span className="truncate">{a.name}</span>
                </div>
                <div className="text-xs text-muted-foreground mt-1 ml-6">
                  {a.type}{a.language ? ` · ${a.language}` : ''}
                </div>
              </button>
            ))}
          </div>

          {/* 오른쪽: 선택된 아티팩트 상세 */}
          <div className="flex-1 overflow-auto p-4">
            {selected ? (
              <ArtifactItem artifact={selected} />
            ) : (
              <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                아티팩트를 선택하세요
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
