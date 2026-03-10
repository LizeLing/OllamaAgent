'use client';

import { useState } from 'react';

interface SourceBadgeProps {
  filename: string;
  chunkText?: string;
}

export default function SourceBadge({ filename, chunkText }: SourceBadgeProps) {
  const [showPreview, setShowPreview] = useState(false);

  return (
    <span className="relative inline-flex items-center">
      <button
        onClick={() => chunkText && setShowPreview(!showPreview)}
        className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] bg-accent/10 text-accent rounded-md hover:bg-accent/20 transition-colors cursor-pointer"
        title={chunkText ? '클릭하여 원본 보기' : filename}
      >
        {filename}
      </button>
      {showPreview && chunkText && (
        <div className="absolute bottom-full left-0 mb-1 w-72 max-h-48 overflow-y-auto p-3 text-xs bg-card border border-border rounded-lg shadow-lg z-50">
          <div className="flex justify-between items-center mb-2">
            <span className="font-medium text-foreground">{filename}</span>
            <button
              onClick={() => setShowPreview(false)}
              className="text-muted hover:text-foreground"
            >
              ✕
            </button>
          </div>
          <p className="text-muted whitespace-pre-wrap">{chunkText}</p>
        </div>
      )}
    </span>
  );
}

/**
 * 텍스트에서 [출처: 파일명] 패턴을 감지하여 SourceBadge로 교체할 수 있도록
 * 파싱 유틸리티를 제공한다.
 */
export function parseSourceCitations(text: string): { type: 'text' | 'source'; content: string }[] {
  const regex = /\[출처:\s*(.+?)\]/g;
  const parts: { type: 'text' | 'source'; content: string }[] = [];
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: 'text', content: text.slice(lastIndex, match.index) });
    }
    parts.push({ type: 'source', content: match[1].trim() });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push({ type: 'text', content: text.slice(lastIndex) });
  }

  return parts.length > 0 ? parts : [{ type: 'text', content: text }];
}
