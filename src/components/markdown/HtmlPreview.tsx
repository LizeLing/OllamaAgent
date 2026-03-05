'use client';

import { useState } from 'react';

interface HtmlPreviewProps {
  html: string;
  onClose: () => void;
}

export default function HtmlPreview({ html, onClose }: HtmlPreviewProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-50" onClick={onClose} />
      <div
        className={`fixed z-50 bg-background border border-border rounded-xl shadow-2xl flex flex-col overflow-hidden transition-all ${
          isFullscreen
            ? 'inset-2'
            : 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90vw] max-w-4xl h-[80vh]'
        }`}
      >
        <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-card shrink-0">
          <span className="text-sm font-medium">HTML Preview</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="p-1.5 text-muted hover:text-foreground rounded transition-colors"
              title={isFullscreen ? '축소' : '전체 화면'}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                {isFullscreen ? (
                  <>
                    <polyline points="4 14 10 14 10 20" />
                    <polyline points="20 10 14 10 14 4" />
                    <line x1="14" y1="10" x2="21" y2="3" />
                    <line x1="3" y1="21" x2="10" y2="14" />
                  </>
                ) : (
                  <>
                    <polyline points="15 3 21 3 21 9" />
                    <polyline points="9 21 3 21 3 15" />
                    <line x1="21" y1="3" x2="14" y2="10" />
                    <line x1="3" y1="21" x2="10" y2="14" />
                  </>
                )}
              </svg>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-muted hover:text-foreground rounded transition-colors"
              title="닫기"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>
        <div className="flex-1 bg-white">
          <iframe
            srcDoc={html}
            sandbox="allow-scripts"
            className="w-full h-full border-0"
            title="HTML Preview"
          />
        </div>
      </div>
    </>
  );
}
