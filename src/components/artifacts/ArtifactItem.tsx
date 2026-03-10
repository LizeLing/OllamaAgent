'use client';

import { useState } from 'react';
import { Artifact } from '@/types/artifacts';

interface ArtifactItemProps {
  artifact: Artifact;
}

export default function ArtifactItem({ artifact }: ArtifactItemProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(artifact.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // 클립보드 API 실패 시 무시
    }
  };

  if (artifact.type === 'image') {
    return (
      <div>
        <h4 className="text-sm font-medium text-foreground mb-3">{artifact.name}</h4>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={artifact.content}
          alt={artifact.name}
          className="max-w-full rounded-lg border border-border"
        />
      </div>
    );
  }

  if (artifact.type === 'code') {
    return (
      <div>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h4 className="text-sm font-medium text-foreground">{artifact.name}</h4>
            {artifact.language && (
              <span className="text-xs text-muted-foreground">{artifact.language}</span>
            )}
          </div>
          <button
            onClick={handleCopy}
            className="px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground bg-card hover:bg-card-hover rounded-lg transition-colors"
            title="코드 복사"
          >
            {copied ? (
              <span className="flex items-center gap-1">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                복사됨
              </span>
            ) : (
              <span className="flex items-center gap-1">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
                복사
              </span>
            )}
          </button>
        </div>
        <pre className="bg-muted p-4 rounded-lg overflow-auto text-sm font-mono whitespace-pre-wrap border border-border/50">
          <code>{artifact.content}</code>
        </pre>
      </div>
    );
  }

  // type === 'file'
  return (
    <div>
      <h4 className="text-sm font-medium text-foreground mb-3">{artifact.name}</h4>
      <pre className="bg-muted p-4 rounded-lg overflow-auto text-sm whitespace-pre-wrap border border-border/50">
        {artifact.content}
      </pre>
    </div>
  );
}
